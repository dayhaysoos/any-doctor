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

test("analyzeBindings: JSX references, type positions, exported and excluded facts", async () => {
  const { analyzeBindings } = await import("../bin/analysis.js");
  const jsx = analyzeBindings("a.tsx", 'import { Button } from "./ui";\nexport default function Demo() { return <div><Button /></div>; }');
  assert.ok(jsx.ok);
  const button = jsx.file.bindings.find((b) => b.name === "Button");
  assert.ok(button && button.references.length > 0, "JSX usage is a reference");
  assert.equal(jsx.file.bindings.find((b) => b.name === "Demo")?.exported, true, "export default marks the function exported");

  const typed = analyzeBindings("b.ts", 'import { Props } from "./t";\nexport function X(p: Props) { return 1; }');
  assert.ok(typed.file.bindings.find((b) => b.name === "Props")?.references.length > 0, "type-position usage is a reference");

  const excluded = analyzeBindings("c.ts", "const { secret: _secret, ...safe } = value;\nexport const y = safe;");
  assert.equal(excluded.file.bindings.find((b) => b.name === "_secret")?.excluded, true, "object-rest exclusion is marked");
  assert.equal(excluded.file.bindings.find((b) => b.name === "y")?.exported, true);

  const destructured = analyzeBindings("d.ts", "const client = makeClient();\nexport const { signOut } = client;");
  assert.equal(destructured.file.bindings.find((b) => b.name === "signOut")?.exported, true, "destructured export is exported");

  const semicolonType = analyzeBindings("e.ts", 'export const status: { label: string; } = { label: "ready" };');
  assert.equal(semicolonType.file.bindings.find((b) => b.name === "status")?.exported, true, "semicolon inside a type annotation does not end the export statement");
});

// --- analyzeSpans (D26): function-like spans as AST facts ---

const { analyzeSpans } = await import("../bin/analysis.js");

test("analyzeSpans: named functions carry their id and extent", () => {
  const r = analyzeSpans("a.ts", [
    "export async function slugify(name: string): string {",
    "  return name.trim();",
    "}",
  ].join("\n"));
  assert.equal(r.ok, true);
  const fn = r.file.spans.find(s => s.kind === "function");
  assert.equal(fn.name, "slugify");
  assert.equal(fn.async, true);
  assert.equal(fn.line, 1);
  assert.equal(fn.endLine, 3);
});

test("analyzeSpans: a semicolon inside a multi-line callback cannot truncate a span (the audit bug class)", () => {
  const r = analyzeSpans("a.ts", [
    "function scan(ctx) {",
    "  const rows = ctx.db.query(\"t\")",
    "    .withIndex(\"by_x\", (q) => { q.eq(\"a\", 1); q.eq(\"b\", 2); })",
    "    .collect();",
    "  return rows;",
    "}",
  ].join("\n"));
  assert.equal(r.ok, true);
  const fn = r.file.spans.find(s => s.kind === "function" && s.name === "scan");
  assert.equal(fn.line, 1);
  assert.equal(fn.endLine, 6, "span covers the whole function despite inner braces and semicolons");
});

test("analyzeSpans: methods, arrows, and classes carry their kinds; anonymous arrows have no name", () => {
  const r = analyzeSpans("a.ts", [
    "class Widget {",
    "  render() {",
    "    const double = (x) => x * 2;",
    "    return double(1);",
    "  }",
    "}",
    "const handler = function () { return 1; };",
  ].join("\n"));
  assert.equal(r.ok, true);
  const kinds = r.file.spans.map(s => s.kind);
  assert.ok(kinds.includes("class"));
  assert.ok(kinds.includes("method"));
  assert.ok(kinds.includes("arrow"));
  assert.ok(kinds.includes("function-expression"));
  const arrow = r.file.spans.find(s => s.kind === "arrow");
  assert.equal(arrow.name, null);
  assert.equal(r.file.spans.find(s => s.kind === "method").name, "render");
  assert.equal(r.file.spans.find(s => s.kind === "class").name, "Widget");
});

test("analyzeSpans: braces inside strings and comments do not bend spans", () => {
  const r = analyzeSpans("a.ts", [
    "function tricky() {",
    "  const s = \"}{ {(\";",
    "  // comment with } brace",
    "  return s.length;",
    "}",
  ].join("\n"));
  assert.equal(r.ok, true);
  const fn = r.file.spans.find(s => s.name === "tricky");
  assert.equal(fn.endLine, 5);
});
