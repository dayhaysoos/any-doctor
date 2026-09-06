import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  const engine = fakeEngine((pattern, language, root) => {
    seen.push({ pattern, language, root });
    return { ok: true, matches: [{ file: root + "/a.ts", range: { start: { line: 1, column: 0 } }, text: "a" }] };
  });
  for (const root of [TARGET, TARGET + "/nested/deep.ts".replace("/deep.ts", "")]) {
    const out = parse(handleSearchLine(request({ pattern: "fetch($$$A)", language: "TypeScript", root }), RUN, engine));
    assert.deepEqual(out.matches, [{ file: root + "/a.ts", range: { start: { line: 1, column: 0 } }, text: "a" }]);
  }
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], { pattern: "fetch($$$A)", language: "TypeScript", root: TARGET });
});

test("handleSearchLine: malformed request bodies and engine failures become error responses", () => {
  assert.match(parse(handleSearchLine(SEARCH_REQUEST + "{not json", RUN, fakeEngine(() => { throw new Error("no"); }))).error, /malformed/);
  assert.match(
    parse(handleSearchLine(request({ pattern: "x", root: TARGET }), RUN, fakeEngine(() => ({ ok: false, error: "sg exploded" })))).error,
    /sg exploded/,
  );
});

test("engine: a real ast-grep round trip through the one invocation module", { skip: spawnSync("sg", ["--version"]).status === 0 ? false : "ast-grep (sg) not on PATH" }, async () => {
  const { runEngineSearch } = await import("../bin/engine.js");
  const repo = path.resolve(import.meta.dirname, "..");
  const r = runEngineSearch("const $A = $B", "TypeScript", path.join(repo, "fixtures", "sample-app"));
  assert.ok(r.ok, "engine succeeds: " + (r.ok ? "" : r.error));
  assert.ok(Array.isArray(r.matches) && r.matches.length > 0, "matches the sample app");
});
