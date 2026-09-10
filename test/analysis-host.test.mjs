import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// The analysis host is the identity engine's side of the channel — a
// pure function from request body to response, directly testable with an
// injected fake analyzer, same shape as the search host's tests.

const { handleAnalysisRequest, clearAnalysisCache } = await import("../bin/analysis-host.js");
const { handleSearchLine } = await import("../bin/search-host.js");
const { SEARCH_REQUEST } = await import("../bin/contract.js");

const TARGET = "/repo/target";
const RUN = { kind: "run", root: TARGET };

const MODEL = {
  file: "src/a.ts",
  bindings: [{ name: "jobs", kind: "Variable", line: 1, column: 6, endLine: 1, endColumn: 40, references: [{ line: 2, column: 12, endLine: 2, endColumn: 16, write: false }] }],
};

const request = (body) => SEARCH_REQUEST + JSON.stringify(body);
const parse = (line) => JSON.parse(line);

test("handleAnalysisRequest: availability passes through the injected status", () => {
  const off = handleAnalysisRequest({ kind: "available", root: TARGET }, RUN, undefined, () => ({ available: false, reason: "not installed" }));
  assert.deepEqual(off, { available: false, reason: "not installed" });
  const on = handleAnalysisRequest({ kind: "available", root: TARGET }, RUN, undefined, () => ({ available: true }));
  assert.deepEqual(on, { available: true });
});

test("handleAnalysisRequest: roots outside the target are refused before the analyzer runs", () => {
  const out = handleAnalysisRequest(
    { kind: "bindings", file: "a.ts", root: "/etc" },
    RUN,
    () => { throw new Error("analyzer must not run"); },
    () => ({ available: true }),
  );
  assert.match(out.error, /outside the allowed target/);
});

test("handleAnalysisRequest: unknown kinds are loud errors naming the known kinds", () => {
  const out = handleAnalysisRequest({ kind: "bindingz", root: TARGET }, RUN, undefined, () => ({ available: true }));
  assert.match(out.error, /unknown analysis kind.*known kinds: available, bindings, spans/);
});

test("handleAnalysisRequest: bindings ask reads the file and returns the analyzer's model, cached by mtime+size", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-ah-"));
  try {
    fs.writeFileSync(path.join(dir, "a.ts"), "const a = 1;\n");
    let calls = 0;
    const analyzer = (file, source) => {
      calls += 1;
      assert.ok(source.includes("const a"));
      return { ok: true, file: { file, bindings: [] } };
    };
    const root = { kind: "run", root: dir };
    const first = handleAnalysisRequest({ kind: "bindings", file: "a.ts", root: dir }, root, analyzer);
    assert.equal(first.file.file, "a.ts");
    const second = handleAnalysisRequest({ kind: "bindings", file: "a.ts", root: dir }, root, analyzer);
    assert.equal(second.file.file, "a.ts");
    assert.equal(calls, 1, "second ask hits the cache");

    // rewriting the file changes mtime/size → the model recomputes
    fs.writeFileSync(path.join(dir, "a.ts"), "const a = 2; const b = 3;\n");
    const third = handleAnalysisRequest({ kind: "bindings", file: "a.ts", root: dir }, root, analyzer);
    assert.equal(third.file.file, "a.ts");
    assert.equal(calls, 2, "changed file recomputes");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    clearAnalysisCache();
  }
});

test("handleSearchLine: op analysis routes to the analysis host", () => {
  const out = parse(handleSearchLine(
    request({ op: "analysis", kind: "available", root: TARGET }),
    RUN,
    () => { throw new Error("search engine must not run for op analysis"); },
  ));
  // the real stack is installed in this repo, so availability is true —
  // what matters is the response SHAPE came from the analysis host
  assert.ok(out.available === true || out.available === false);
});

test("handleSearchLine: an unknown op is a loud error, never a silent pattern search", () => {
  const out = parse(handleSearchLine(
    request({ op: "analysiss", root: TARGET }),
    RUN,
    () => ({ ok: true, matches: [] }),
  ));
  assert.match(out.error, /unknown search-channel op "analysiss".*known ops: pattern, rule, rules, analysis/);
});

test("handleSearchLine: op rules reaches the engine as a named-rule batch", () => {
  const seen = [];
  const engine = (query) => {
    seen.push(query);
    return { ok: true, matches: [{ file: TARGET + "/a.ts", text: "t", ruleId: "map-arrow" }] };
  };
  const rules = [
    { id: "map-arrow", pattern: "$X.map(async $A => $B)" },
    { id: "combiner", pattern: "Promise.$M($$$A)" },
  ];
  const out = parse(handleSearchLine(request({ op: "rules", rules, root: TARGET }), RUN, engine));
  assert.deepEqual(seen[0], { op: "rules", rules });
  assert.deepEqual(out.matches, [{ file: TARGET + "/a.ts", text: "t", ruleId: "map-arrow" }]);
});

test("handleSearchLine: a missing op still means pattern (the original wire form)", () => {
  const out = parse(handleSearchLine(
    request({ pattern: "fetch($$$A)", root: TARGET }),
    RUN,
    (query) => {
      assert.deepEqual(query, { op: "pattern", pattern: "fetch($$$A)" });
      return { ok: true, matches: [] };
    },
  ));
  assert.deepEqual(out, { matches: [] });
});

test("handleAnalysisRequest: spans ask routes to the spans analyzer with its own cache", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-ah-"));
  try {
    fs.writeFileSync(path.join(dir, "a.ts"), "function a() { return 1; }\n");
    let spansCalls = 0;
    let analyzerCalls = 0;
    const spansAnalyzer = (file, source) => {
      spansCalls += 1;
      assert.ok(source.includes("function a"));
      return { ok: true, file: { file, spans: [] } };
    };
    const analyzer = () => { analyzerCalls += 1; return { ok: true, file: { file: "x", bindings: [] } }; };
    const root = { kind: "run", root: dir };
    const first = handleAnalysisRequest({ kind: "spans", file: "a.ts", root: dir }, root, analyzer, undefined, spansAnalyzer);
    assert.deepEqual(first.file.spans, []);
    const second = handleAnalysisRequest({ kind: "spans", file: "a.ts", root: dir }, root, analyzer, undefined, spansAnalyzer);
    assert.deepEqual(second.file.spans, []);
    assert.equal(spansCalls, 1, "second ask hits the spans cache");
    assert.equal(analyzerCalls, 0, "spans never consult the bindings analyzer");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    clearAnalysisCache();
  }
});
