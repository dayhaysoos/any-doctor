import { test } from "node:test";
import assert from "node:assert/strict";

// The analysis adapter is the identity engine's one home — these tests
// run the real stack (oxc-parser + eslint-scope are devDependencies, so
// the engine is always present here; absence is covered by the sdk/host
// guard tests).

const { analysisStatus, analyzeBindings } = await import("../bin/analysis.js");

test("analysisStatus: the stack is installed in this repo", () => {
  const s = analysisStatus();
  assert.equal(s.available, true);
});

test("analyzeBindings: same-name bindings in different scopes stay separate", () => {
  const source = [
    "const jobs = ids.map(async id => load(id));",
    "Promise.all(jobs);",
    "function other() {",
    "  const jobs = xs.map(x => x);",
    "  return jobs.length;",
    "}",
  ].join("\n");
  const r = analyzeBindings("a.ts", source);
  assert.ok(r.ok);
  const both = r.ok ? r.file.bindings.filter((b) => b.name === "jobs") : [];
  assert.equal(both.length, 2);
  const [moduleJobs, innerJobs] = both;
  assert.equal(moduleJobs.line, 1);
  assert.equal(moduleJobs.kind, "Variable");
  // decl write (line 1) + read inside Promise.all (line 2)
  assert.deepEqual(moduleJobs.references.map((x) => `${x.write ? "W" : "R"}${x.line}`), ["W1", "R2"]);
  assert.equal(innerJobs.line, 4);
  assert.deepEqual(innerJobs.references.map((x) => `${x.write ? "W" : "R"}${x.line}`), ["W4", "R5"]);
});

test("analyzeBindings: a declarator span contains its initializer (the bridge to shape matches)", () => {
  const source = "export function work(ids: string[]) {\n  const results = ids.map(async id => load(id))\n  return results.length\n}\n";
  const r = analyzeBindings("a.ts", source);
  assert.ok(r.ok);
  const results = r.ok ? r.file.bindings.find((b) => b.name === "results") : undefined;
  assert.ok(results, "results binding exists");
  // line 2, columns 8 (name) .. 47 (end of the map call): the shape at
  // 2:18 sits INSIDE this span — lines 1-based, columns 0-based.
  assert.equal(results.line, 2);
  assert.equal(results.column, 8);
  assert.equal(results.endLine, 2);
  assert.ok(results.endColumn > 30, "span covers the initializer");
});

test("analyzeBindings: parameter spans are the identifier, not the whole function", () => {
  const source = "function work(ids) {\n  return ids.length;\n}\n";
  const r = analyzeBindings("a.ts", source);
  const ids = r.ok ? r.file.bindings.find((b) => b.name === "ids") : undefined;
  assert.ok(ids);
  assert.equal(ids.kind, "Parameter");
  assert.equal(ids.line, 1);
  // a tiny span: same line, a few columns wide — it must not swallow line 2
  assert.equal(ids.endLine, 1);
  assert.ok(ids.endColumn - ids.column < 5);
});

test("analyzeBindings: imports are bindings; a never-used import has zero references", () => {
  const source = 'import { used, unused } from "./x";\nconsole.log(used);\n';
  const r = analyzeBindings("a.ts", source);
  const find = (n) => (r.ok ? r.file.bindings.find((b) => b.name === n) : undefined);
  assert.equal(find("used")?.references.filter((x) => !x.write).length, 1);
  assert.equal(find("unused")?.references.length, 0);
});

test("analyzeBindings: reassignment appears as a write reference outside the declaration span", () => {
  const source = "let jobs = a.map(x => x);\njobs = b.map(x => x);\n";
  const r = analyzeBindings("a.ts", source);
  const jobs = r.ok ? r.file.bindings.find((b) => b.name === "jobs") : undefined;
  assert.ok(jobs);
  const writes = jobs.references.filter((x) => x.write);
  assert.equal(writes.length, 2);
  const reassign = writes.find((w) => w.line === 2);
  assert.ok(reassign, "reassignment is a write at line 2");
});
