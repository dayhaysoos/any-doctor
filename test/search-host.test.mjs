import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// The search host is a pure function from request line to response body —
// the interface is the test surface. The root-containment check is a
// security decision and gets direct tests, including the attack cases that
// used to be reachable only through a real doctor child.

const { handleSearchLine, searchBase } = await import("../bin/search-host.js");
const { SEARCH_REQUEST } = await import("../bin/contract.js");

const request = (body) => SEARCH_REQUEST + JSON.stringify(body);
const parse = (line) => JSON.parse(line);
const fakeEngine = (impl) => impl;
const TARGET = "/repo/target";
const RUN = { kind: "run", root: TARGET };

test("searchBase: a run may search its target, verify its own sandbox prefix, meta nothing", () => {
  assert.equal(searchBase(RUN), TARGET);
  assert.equal(searchBase({ kind: "verify", fixtures: "/x.fixtures.mjs" }), path.join(os.tmpdir(), "any-doctor-verify-"));
  assert.equal(searchBase({ kind: "meta" }), "");
});

test("handleSearchLine: verify mode may search only its sandbox prefix, not the whole temp dir", () => {
  const verify = { kind: "verify", fixtures: "/x.fixtures.mjs" };
  const refuse = handleSearchLine(
    request({ pattern: "x", root: path.join(os.tmpdir(), "someone-elses-dir") }),
    verify, fakeEngine(() => { throw new Error("engine must not run"); }));
  assert.match(parse(refuse).error, /outside the allowed target/);
  const allow = handleSearchLine(
    request({ pattern: "x", root: path.join(os.tmpdir(), "any-doctor-verify-abc123") }),
    verify, fakeEngine((p, l, root) => ({ ok: true, matches: [] })));
  assert.deepEqual(parse(allow), { matches: [] });
});

test("handleSearchLine: non-request lines are ignored, not answered", () => {
  assert.equal(handleSearchLine("hello", RUN, fakeEngine(() => { throw new Error("must not run"); })), null);
});

test("handleSearchLine: the root must be inside the run's target — escape attempts are refused", () => {
  for (const root of ["/etc", "/repo", "/repo/target/../../elsewhere", "", "/repo/other"]) {
    const out = handleSearchLine(request({ pattern: "x", root }), RUN, fakeEngine(() => { throw new Error("engine must not run"); }));
    assert.match(parse(out).error, /outside the allowed target/, `root=${root}`);
  }
  assert.match(
    parse(handleSearchLine(request({ pattern: "x", root: TARGET }), { kind: "meta" }, fakeEngine(() => { throw new Error("no"); }))).error,
    /outside the allowed target/,
    "meta mode may not search at all",
  );
});

test("handleSearchLine: the run's target and paths inside it are allowed through to the engine", () => {
  const seen = [];
  const engine = fakeEngine((query, language, root) => {
    seen.push({ query, language, root });
    return { ok: true, matches: [{ file: root + "/a.ts", range: { start: { line: 1, column: 0 } }, text: "a" }] };
  });
  for (const root of [TARGET, TARGET + "/nested/deep.ts".replace("/deep.ts", "")]) {
    const out = parse(handleSearchLine(request({ pattern: "fetch($$$A)", language: "TypeScript", root }), RUN, engine));
    assert.deepEqual(out.matches, [{ file: root + "/a.ts", range: { start: { line: 1, column: 0 } }, text: "a" }]);
  }
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], { query: { op: "pattern", pattern: "fetch($$$A)" }, language: "TypeScript", root: TARGET });
});

test("handleSearchLine: an op:rule body reaches the engine as a rule query; matches pass through", () => {
  const seen = [];
  const engine = fakeEngine((query, language, root) => {
    seen.push({ query, language, root });
    return { ok: true, matches: [{ file: root + "/a.ts", text: "t", metaVariables: { multi: { ARGS: [{ text: "x" }] } } }] };
  });
  const rule = { pattern: "fetch($$$ARGS)", inside: { pattern: "useEffect($$$B)" } };
  const out = parse(handleSearchLine(request({ op: "rule", rule, language: "JavaScript", root: TARGET }), RUN, engine));
  assert.deepEqual(seen[0], { query: { op: "rule", rule }, language: "JavaScript", root: TARGET });
  assert.deepEqual(out.matches, [{ file: TARGET + "/a.ts", text: "t", metaVariables: { multi: { ARGS: [{ text: "x" }] } } }]);
});

test("handleSearchLine: engine rule failures come back as error responses verbatim", () => {
  const engine = fakeEngine(() => ({ ok: false, error: "ast-grep rejected the rule: pattern is ambiguous" }));
  const out = parse(handleSearchLine(request({ op: "rule", rule: { pattern: "x" }, root: TARGET }), RUN, engine));
  assert.match(out.error, /pattern is ambiguous/);
});

test("handleSearchLine: malformed request bodies and engine failures become error responses", () => {
  assert.match(parse(handleSearchLine(SEARCH_REQUEST + "{not json", RUN, fakeEngine(() => { throw new Error("no"); }))).error, /malformed/);
  assert.match(
    parse(handleSearchLine(request({ pattern: "x", root: TARGET }), RUN, fakeEngine(() => ({ ok: false, error: "sg exploded" })))).error,
    /sg exploded/,
  );
});

const D18_MATCHES = (root) => ([
  { file: root + "/src/app.ts", text: "a" },
  { file: "src/plain.ts", text: "bare-relative form" },
  { file: root + "/src/app.test.ts", text: "b" },
  { file: root + "/src/ui.spec.tsx", text: "c" },
  { file: root + "/tests/helper.ts", text: "d" },
]);

test("handleSearchLine: D18 — test paths are filtered from results on a default run", () => {
  const engine = fakeEngine((p, l, root) => ({ ok: true, matches: D18_MATCHES(root) }));
  const out = parse(handleSearchLine(request({ pattern: "x", root: TARGET }), RUN, engine));
  assert.deepEqual(out.matches.map((m) => m.file), [TARGET + "/src/app.ts", "src/plain.ts"]);
});

test("handleSearchLine: --include-tests keeps test paths in results", () => {
  const engine = fakeEngine((p, l, root) => ({ ok: true, matches: D18_MATCHES(root) }));
  const out = parse(handleSearchLine(request({ pattern: "x", root: TARGET }), { kind: "run", root: TARGET, includeTests: true }, engine));
  assert.equal(out.matches.length, 5);
});

test("handleSearchLine: verify keeps test paths — the sandbox is the doctor's own world", () => {
  const sandbox = path.join(os.tmpdir(), "any-doctor-verify-t1");
  const verify = { kind: "verify", fixtures: "/x.fixtures.mjs" };
  const engine = fakeEngine((p, l, root) => ({ ok: true, matches: [{ file: root + "/src/user.test.ts", text: "x" }] }));
  const out = parse(handleSearchLine(request({ pattern: "x", root: sandbox }), verify, engine));
  assert.equal(out.matches.length, 1);
});

// The engine tries ast-grep first and falls back to sg — either binary
// on PATH means the round trip can run.
const hasEngine = ["ast-grep", "sg"].some((name) => spawnSync(name, ["--version"]).status === 0);
const engineSkip = hasEngine ? false : "ast-grep not on PATH";

test("engine: a real ast-grep round trip through the one invocation module", { skip: engineSkip }, async () => {
  const { runEngine } = await import("../bin/engine.js");
  const repo = path.resolve(import.meta.dirname, "..");
  const r = runEngine({ op: "pattern", pattern: "const $A = $B" }, "TypeScript", path.join(repo, "fixtures", "sample-app"));
  assert.ok(r.ok, "engine succeeds: " + (r.ok ? "" : r.error));
  assert.ok(Array.isArray(r.matches) && r.matches.length > 0, "matches the sample app");
});

test("engine: a rule query round trip returns end ranges and metavariable captures", { skip: engineSkip }, async () => {
  const { runEngine } = await import("../bin/engine.js");
  const repo = path.resolve(import.meta.dirname, "..");
  const r = runEngine({ op: "rule", rule: { pattern: "fetch($$$ARGS)" } }, "TypeScript", path.join(repo, "fixtures", "sample-app"));
  assert.ok(r.ok, "rule query succeeds: " + (r.ok ? "" : r.error));
  const withArgs = r.ok ? r.matches.filter((m) => m.metaVariables?.multi?.ARGS) : [];
  assert.ok(withArgs.length > 0, "captures ARGS");
  const first = withArgs[0];
  assert.ok(first.range?.end?.line !== undefined, "end range survives the seam");
  // The raw engine output DOES include separator commas as captures — the
  // sdk's Match mapping filters them; this asserts the raw shape so the
  // normalization below has a pinned reason to exist.
  assert.ok(
    withArgs.some((m) => m.metaVariables.multi.ARGS.some((a) => a.text === ",")),
    "raw multi-captures include commas (sdk filters them for doctors)",
  );
});

test("engine: a multi-rule batch returns one invocation's matches, each tagged with its ruleId", { skip: engineSkip }, async () => {
  const { runEngine } = await import("../bin/engine.js");
  const repo = path.resolve(import.meta.dirname, "..");
  const r = runEngine({
    op: "rules",
    rules: [
      { id: "map-arrow", pattern: "$X.map(async $A => $B)" },
      { id: "fetch-any", pattern: "fetch($$$ARGS)" },
      { id: "never-matches", pattern: "zzzImpossiblePattern($$$A)" },
    ],
  }, "TypeScript", path.join(repo, "fixtures", "sample-app"));
  assert.ok(r.ok, "batch succeeds: " + (r.ok ? "" : r.error));
  const ids = new Set(r.ok ? r.matches.map((m) => m.ruleId) : []);
  assert.ok(ids.has("map-arrow"), "map rule tagged");
  assert.ok(ids.has("fetch-any"), "fetch rule tagged");
  assert.ok(!ids.has("never-matches"), "non-matching rule contributes nothing");
  assert.ok(!ids.has(undefined), "every match carries a ruleId");
});

// Dogfood find (sift-skills, 979 files): the pilot's ten-pattern batch
// emits 24MB of JSON — spawnSync's 1MB default truncated it mid-array
// and the run crashed as "unparseable output". This pins the raised
// ceiling: a batch whose JSON clears the old cap must still parse.
test("engine: a batch whose JSON outgrows spawnSync's 1MB default still parses", { skip: engineSkip }, async () => {
  const { runEngine } = await import("../bin/engine.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-buffer-"));
  try {
    const lines = ["export async function f() {"];
    for (let i = 0; i < 60; i++) lines.push("  await step" + i + "();");
    lines.push("}");
    const body = lines.join("\n") + "\n";
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    for (let i = 0; i < 150; i++) {
      fs.writeFileSync(path.join(dir, "src", "f" + String(i).padStart(4, "0") + ".ts"), body);
    }
    const r = runEngine({ op: "rules", rules: [{ id: "await", pattern: "await $E" }] }, "TypeScript", dir);
    assert.ok(r.ok, "big batch succeeds: " + (r.ok ? "" : r.error));
    assert.equal(r.ok ? r.matches.length : 0, 150 * 60, "every await matched through the raised buffer");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The overflow branch's dead-code history: it matched only the
// streams-side error name, while spawnSync actually reports ENOBUFS
// (verified Node 14–26) — so a real overflow fell through to a
// misleading "unparseable output" complaint. Pin both names.
test("engine: an exceeded output buffer is named for what it is", async () => {
  const { isBufferOverflow } = await import("../bin/engine.js");
  assert.equal(isBufferOverflow({ error: { code: "ENOBUFS" } }), true, "spawnSync's actual overflow code");
  assert.equal(isBufferOverflow({ error: { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" } }), true, "the streams-side name, kept for belt and braces");
  assert.equal(isBufferOverflow({ error: { code: "ENOENT" } }), false, "a missing binary is not an overflow");
  assert.equal(isBufferOverflow({}), false, "no error is not an overflow");
});
