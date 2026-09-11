import { test } from "node:test";
import assert from "node:assert/strict";

// The identity layer's acceptance matrix (analysis-improvements A1/A2),
// exercised at unit level with hand-built sources and spans — deterministic,
// engine-independent. The diff integration tests in diff.test.mjs run the
// same laws through the real CLI path; certification's exact matching has
// its own pins in certify.test.mjs and must never become movement-tolerant.

const {
  extractEvidence, compareOccurrences, scanProvenance, comparableScans, IDENTITY_SCHEMA_VERSION,
} = await import("../bin/identity.js");

const mem = (files) => (file) => (Object.prototype.hasOwnProperty.call(files, file) ? files[file] : null);
const noSpans = () => null;

function ev(findings, files, spansFor = noSpans) {
  return extractEvidence(findings, mem(files), spansFor).occurrences;
}

const f = (line, column, checkKey = "doc/rule", file = "x.ts") => ({
  ...(column === undefined ? {} : { column }), checkKey, file, line,
});

// Two synthetic function spans over a 6-line source, the classic shape:
// function a (1-3), function b (4-6), one flagged line inside each.
const SPANS_AB = [
  { kind: "function", name: "a", async: false, line: 1, column: 0, endLine: 3, endColumn: 1 },
  { kind: "function", name: "b", async: false, line: 4, column: 0, endLine: 6, endColumn: 1 },
];
const SRC_AB = "function a() {\n  doWork(BAD);\n}\nfunction b() {\n  doWork(BAD);\n}\n";

test("identity: a moved unchanged line continues — blank lines above change nothing", () => {
  const base = ev([f(2)], { "x.ts": "const ok = 1;\nconst BAD = 1;\n" });
  const head = ev([f(4)], { "x.ts": "const ok = 1;\n\n\nconst BAD = 1;\n" });
  const cmp = compareOccurrences(base, head);
  assert.equal(cmp.pairs.length, 1, "the occurrence continues");
  assert.deepEqual(cmp.addedIndices, [], "movement is not addition");
  assert.deepEqual(cmp.absentIndices, [], "movement is not disappearance");
});

test("identity: an unrelated edit in the same file keeps the occurrence continuing", () => {
  const base = ev([f(3)], { "x.ts": "function a() {\n  other(1);\n  doWork(BAD);\n}\n" });
  const head = ev([f(3)], { "x.ts": "function a() {\n  other(2);\n  doWork(BAD);\n}\n" });
  const cmp = compareOccurrences(base, head);
  assert.equal(cmp.pairs.length, 1, "the neighbor line changed, the flagged line did not");
  assert.equal(cmp.addedIndices.length, 0);
  assert.equal(cmp.absentIndices.length, 0);
});

test("identity: an edit to the flagged line breaks continuity — operator/literal changes are visible", () => {
  const base = ev([f(1)], { "x.ts": "await x(1);\n" });
  const head = ev([f(1)], { "x.ts": "await x(2);\n" });
  const cmp = compareOccurrences(base, head);
  assert.equal(cmp.pairs.length, 0, "changed content never continues");
  assert.equal(cmp.addedIndices.length, 1);
  assert.equal(cmp.absentIndices.length, 1);
});

test("identity: CRLF and LF spellings of one line share a digest", () => {
  const base = ev([f(1)], { "x.ts": "const BAD = 1;\r\n" });
  const head = ev([f(1)], { "x.ts": "const BAD = 1;\n" });
  assert.equal(compareOccurrences(base, head).pairs.length, 1);
});

test("identity: reindentation preserves the relative column", () => {
  const base = ev([f(1, 8)], { "x.ts": "  doWork(BAD);\n" });
  const head = ev([f(1, 10)], { "x.ts": "    doWork(BAD);\n" });
  assert.equal(compareOccurrences(base, head).pairs.length, 1, "4-space reindent of a 2-space line");
});

test("identity: two findings on one line stay distinct via relative columns", () => {
  const src = { "x.ts": "BAD(BAD);\n" };
  const both = [f(1, 6), f(1, 10)];
  const cmp = compareOccurrences(ev(both, src), ev(both, src));
  assert.equal(cmp.pairs.length, 2);
  // The second occurrence disappears at head: one continuing, one absent.
  const dropped = compareOccurrences(ev(both, src), ev([f(1, 6)], src));
  assert.equal(dropped.pairs.length, 1);
  assert.equal(dropped.absentIndices.length, 1);
});

test("identity: identical text in two modules stays distinct (file is part of the key)", () => {
  const one = (file) => ev([f(1, undefined, "doc/rule", file)], { "a.ts": "const BAD = 1;\n", "b.ts": "const BAD = 1;\n" });
  const cmp = compareOccurrences(one("a.ts"), one("b.ts"));
  assert.equal(cmp.pairs.length, 0, "no cross-file text collapse");
  assert.equal(cmp.addedIndices.length, 1);
  assert.equal(cmp.absentIndices.length, 1);
});

test("identity: two doctors using the same rule name never share continuity", () => {
  const src = { "x.ts": "const BAD = 1;\n" };
  const cmp = compareOccurrences(ev([f(1, undefined, "one/shared")], src), ev([f(1, undefined, "two/shared")], src));
  assert.equal(cmp.pairs.length, 0);
  assert.equal(cmp.addedIndices.length, 1);
});

test("identity: identical occurrences match by cardinality — the third copy cannot hide", () => {
  const base = ev([f(1), f(2)], { "x.ts": "const BAD = 1;\nconst BAD = 1;\n" });
  const head = ev([f(1), f(3), f(5)], { "x.ts": "const BAD = 1;\n\nconst BAD = 1;\n\nconst BAD = 1;\n" });
  const cmp = compareOccurrences(base, head);
  assert.equal(cmp.pairs.length, 2, "the two existing copies continue");
  assert.equal(cmp.addedIndices.length, 1, "the third copy is added");
  assert.equal(cmp.ambiguous, 1, "the duplicate bucket is reported as ambiguous");
});

test("identity: structural context keeps identical text in different functions from sharing an identity", () => {
  // Base flags one line in a() and one in b(); head deletes a(), keeps b(),
  // and adds the same line in c(). Same content everywhere — only context
  // can say which occurrence continued.
  const base = ev([f(2, 8), f(5, 8)], { "x.ts": SRC_AB }, () => SPANS_AB);
  const SRC_CB = "function b() {\n  doWork(BAD);\n}\nfunction c() {\n  doWork(BAD);\n}\n";
  const SPANS_CB = [
    { kind: "function", name: "b", async: false, line: 1, column: 0, endLine: 3, endColumn: 1 },
    { kind: "function", name: "c", async: false, line: 4, column: 0, endLine: 6, endColumn: 1 },
  ];
  const head = ev([f(2, 8), f(5, 8)], { "x.ts": SRC_CB }, () => SPANS_CB);
  const cmp = compareOccurrences(base, head);
  assert.equal(cmp.pairs.length, 1, "only the b() occurrence continues");
  assert.equal(cmp.addedIndices.length, 1, "the c() occurrence is new");
  assert.equal(cmp.absentIndices.length, 1, "the a() occurrence is gone");
  assert.equal(cmp.pairs[0].contextFallback, false, "a contexted match is not fallback");
});

test("identity: without structural context, content matching is the documented fallback and says so", () => {
  const base = ev([f(2, 8), f(5, 8)], { "x.ts": SRC_AB });
  const head = ev([f(2, 8), f(5, 8)], { "x.ts": SRC_AB });
  const cmp = compareOccurrences(base, head);
  assert.equal(cmp.pairs.length, 2, "engine-off: content + namespace + file");
  assert.equal(cmp.pairs.filter(p => p.contextFallback).length, 2, "every match is flagged content-only");
  assert.equal(cmp.ambiguous, 1, "the identical pair is a duplicate bucket");
});

test("identity: the innermost span owns the occurrence — nested callbacks bind to their own function", () => {
  const SRC_NESTED = "function outer() {\n  step(1);\n  const inner = () => {\n    step(2);\n  };\n}\n";
  const spans = [
    { kind: "function", name: "outer", async: false, line: 1, column: 0, endLine: 6, endColumn: 1 },
    { kind: "arrow", name: null, async: false, line: 3, column: 22, endLine: 5, endColumn: 3 },
  ];
  const occ = ev([f(2, 2), f(4, 4)], { "x.ts": SRC_NESTED }, () => spans);
  assert.equal(occ[0].contextId, "function:outer#0");
  assert.equal(occ[1].contextId, "arrow:\u00000", "anonymous spans carry a NUL separator no identifier can collide with");
});

test("identity: top-level code has no enclosing span — context null, match still content-confident", () => {
  const occ = ev([f(1)], { "x.ts": "const BAD = 1;\n" }, () => []);
  assert.equal(occ[0].contextId, null);
  const cmp = compareOccurrences(occ, ev([f(2)], { "x.ts": "\nconst BAD = 1;\n" }, () => []));
  assert.equal(cmp.pairs.length, 1);
  assert.equal(cmp.pairs[0].contextFallback, true);
});

test("identity: an identically-named sibling inserted above shifts ordinals — conservative break, no false continuity", () => {
  // Base has function a (ordinal 0); head gains another a above it, so the
  // original becomes a#1. Same content, different context id: no match.
  const base = ev([f(2, 8)], { "x.ts": SRC_AB.slice(0, SRC_AB.indexOf("function b")) }, () => [SPANS_AB[0]]);
  const headSrc = "function a() {\n  other();\n}\nfunction a() {\n  doWork(BAD);\n}\n";
  const headSpans = [
    { kind: "function", name: "a", async: false, line: 1, column: 0, endLine: 3, endColumn: 1 },
    { kind: "function", name: "a", async: false, line: 4, column: 0, endLine: 6, endColumn: 1 },
  ];
  const head = ev([f(5, 8)], { "x.ts": headSrc }, () => headSpans);
  const cmp = compareOccurrences(base, head);
  assert.equal(cmp.pairs.length, 0, "the ordinal shift refuses continuity");
  assert.equal(cmp.addedIndices.length, 1);
  assert.equal(cmp.absentIndices.length, 1);
});

test("identity: non-ASCII and emoji content digest honestly", () => {
  const src = { "x.ts": "const BAD = 'café ☕';\n" };
  const moved = ev([f(3)], { "x.ts": "// pad\n// pad\nconst BAD = 'café ☕';\n" });
  assert.equal(compareOccurrences(ev([f(1)], src), moved).pairs.length, 1, "same emoji line continues");
  const changed = ev([f(1)], { "x.ts": "const BAD = 'café 🍵';\n" });
  assert.equal(compareOccurrences(ev([f(1)], src), changed).pairs.length, 0, "a swapped emoji is a change");
});

test("identity: a finding past end-of-file is stale — never matched, counted", () => {
  const cmp = compareOccurrences(
    ev([f(1)], { "x.ts": "const BAD = 1;\n" }),
    ev([f(99)], { "x.ts": "const BAD = 1;\n" }),
  );
  assert.equal(cmp.pairs.length, 0, "stale evidence never continues");
  assert.equal(cmp.addedIndices.length, 1);
  assert.equal(cmp.stale, 1);
});

test("identity: an unreadable file is evidence-less and reported", () => {
  const report = extractEvidence([f(1)], mem({}), noSpans);
  assert.deepEqual(report.unreadableFiles, ["x.ts"]);
  assert.equal(report.occurrences[0].lineDigest, null);
  assert.equal(compareOccurrences(report.occurrences, report.occurrences).pairs.length, 0);
});

test("identity: evidence order parallels the input findings — interleaved files never regroup", () => {
  // A doctor's findings interleave files across checks (all of rule A,
  // then all of rule B); the evidence array must stay index-aligned with
  // that input or every comparison index misattributes. Found on the real
  // Sift smoke: the wrong occurrence was labeled added.
  const files = { "a.ts": "const BAD = 1;\n", "b.ts": "const BAD = 1;\n\n\n\n\n\n\n\nconst BAD = 1;\n" };
  const inputs = [
    f(1, undefined, "d/ruleA", "a.ts"),
    f(1, undefined, "d/ruleA", "b.ts"),
    f(1, undefined, "d/ruleB", "a.ts"),
    f(9, undefined, "d/ruleB", "b.ts"),
  ];
  const occ = extractEvidence(inputs, mem(files), noSpans).occurrences;
  assert.deepEqual(
    occ.map(o => `${o.checkKey.slice(2)}@${o.file}:${o.line}`),
    ["ruleA@a.ts:1", "ruleA@b.ts:1", "ruleB@a.ts:1", "ruleB@b.ts:9"],
    "occurrence i describes input finding i",
  );
  // The added index must name the genuinely new occurrence, not a shifted one.
  const base = occ;
  const head = extractEvidence(inputs.concat([f(1, undefined, "d/ruleB", "a.ts")]), mem(files), noSpans).occurrences;
  const cmp = compareOccurrences(base, head);
  assert.deepEqual(cmp.addedIndices, [4], "the new occurrence at index 4 is the added one");
});

test("identity: a file the engine cannot parse reports context unavailability", () => {
  const report = extractEvidence([f(1)], mem({ "x.ts": "const BAD = 1;\n" }), noSpans);
  assert.deepEqual(report.contextUnavailableFiles, ["x.ts"]);
});

test("identity: one-sided parse failure refuses continuity — unverified structure is not guessed", () => {
  // The base file failed to parse (no spans); the head file parses and
  // claims context. Identical content is not enough: the pair surfaces as
  // added plus absent rather than a guessed continuation.
  const base = ev([f(2, 8)], { "x.ts": SRC_AB }, noSpans);
  const head = ev([f(2, 8)], { "x.ts": SRC_AB }, () => SPANS_AB);
  const cmp = compareOccurrences(base, head);
  assert.equal(cmp.pairs.length, 0);
  assert.equal(cmp.addedIndices.length, 1);
  assert.equal(cmp.absentIndices.length, 1);
});

test("identity: a same-length edit is still a change — content, not size or timestamps, is the evidence", () => {
  const base = ev([f(1)], { "x.ts": "const BAD = 1;\n" });
  const head = ev([f(1)], { "x.ts": "const BAD = 2;\n" });
  assert.equal(compareOccurrences(base, head).pairs.length, 0, "same byte length, different literal");
});

test("identity: a multiline expression's continuation lines are outside v1 evidence — pinned limitation", () => {
  // v1 digests the flagged line only (D30): an edit on a CONTINUATION line
  // of a multiline expression does not break continuity. This is the
  // documented deferral — primary-expression ranges need Finding end
  // coordinates or doctor-supplied ranges (the open M2 contract question).
  const base = ev([f(1)], { "x.ts": "await doWork(BAD,\n  option(1),\n);\n" });
  const continuationEdited = ev([f(1)], { "x.ts": "await doWork(BAD,\n  option(2),\n);\n" });
  assert.equal(compareOccurrences(base, continuationEdited).pairs.length, 1,
    "pinned: continuation-line edits do not currently invalidate");
  const flaggedEdited = ev([f(1)], { "x.ts": "await doWork(WORSE,\n  option(1),\n);\n" });
  assert.equal(compareOccurrences(base, flaggedEdited).pairs.length, 0,
    "an edit on the flagged line itself still breaks continuity");
});

test("identity: provenance digests the exact program bytes; changed programs are incomparable", () => {
  const doctors = [{ id: "d", programPath: "/x/d.mjs" }];
  const read = (content) => () => content;
  const p1 = scanProvenance(doctors, true, read("program v1"));
  const p1again = scanProvenance(doctors, false, read("program v1"));
  assert.equal(comparableScans(p1, p1again), true, "analysis availability differs; programs do not");
  assert.equal(p1.schema, IDENTITY_SCHEMA_VERSION);
  const p2 = scanProvenance(doctors, true, read("program v2"));
  assert.equal(comparableScans(p1, p2), false, "changed detector bytes refuse continuity");
  // A metadata-only change (a comment) is still a byte change — the
  // documented conservative churn of whole-program digests; per-check
  // revisions are the open M2 refinement.
  const commented = scanProvenance(doctors, true, read("program v1 // a harmless comment"));
  assert.equal(comparableScans(p1, commented), false, "comment-only churn is conservative today, by design");
  const other = scanProvenance([{ id: "e", programPath: "/x/e.mjs" }], true, read("program v1"));
  assert.equal(comparableScans(p1, other), false, "a different doctor set is incomparable");
});

test("identity: an unreadable doctor program is marked, not crashed", () => {
  const p = scanProvenance([{ id: "d", programPath: "/x/gone.mjs" }], false, () => null);
  assert.equal(p.doctors[0].digest, scanProvenance([{ id: "d", programPath: "/x/gone2.mjs" }], false, () => null).doctors[0].digest);
});

// ---- literal preservation (review finding 1: whitespace must not cross
// literal boundaries) -----------------------------------------------

const lineEv = (src) => ev([f(1)], { "k.ts": src });

test("identity: whitespace inside string literals is semantic — no collapse across quotes", () => {
  assert.equal(compareOccurrences(lineEv('const key = "a  b";\n'), lineEv('const key = "a b";\n')).pairs.length, 0,
    "the review's exact case: a double space inside a literal is a change");
  assert.equal(compareOccurrences(lineEv("const c = 'a  b';\n"), lineEv("const c = 'a b';\n")).pairs.length, 0,
    "char literals too");
  assert.equal(compareOccurrences(lineEv("const s = `x  ${a}  y`;\n"), lineEv("const s = `x ${a} y`;\n")).pairs.length, 0,
    "template interiors too");
});

test("identity: regex literal interiors stay byte-exact; division still collapses", () => {
  assert.equal(compareOccurrences(lineEv("return /a  b/.test(x);\n"), lineEv("return /a b/.test(x);\n")).pairs.length, 0,
    "a regex after a keyword (return)");
  assert.equal(compareOccurrences(lineEv("const r = /a  b/;\n"), lineEv("const r = /a b/;\n")).pairs.length, 0,
    "a regex after an operator (=)");
  assert.equal(compareOccurrences(lineEv("const r = x /  2;\n"), lineEv("const r = x / 2;\n")).pairs.length, 1,
    "division is code — reformatting around it still matches");
});

test("identity: code-region whitespace still collapses; comments never open literals", () => {
  assert.equal(compareOccurrences(lineEv("const  x  =  1;\n"), lineEv("const x = 1;\n")).pairs.length, 1,
    "between-token reformat tolerance survives");
  assert.equal(compareOccurrences(lineEv("const BAD = 1; // don't care here\n"), lineEv("const BAD = 1;  // don't care here\n")).pairs.length, 1,
    "an apostrophe inside a line comment is not an unterminated string");
});

test("identity: an unterminated literal start falls back conservatively", () => {
  // The opening line of a multiline template: the scanner cannot resolve
  // it, so nothing collapses — byte-honest, merely less reformat-tolerant.
  assert.equal(compareOccurrences(lineEv("const s = `abc  def\n"), lineEv("const s = `abc def\n")).pairs.length, 0);
  assert.equal(compareOccurrences(lineEv("const s = `abc  def\n"), lineEv("const s = `abc  def\n")).pairs.length, 1);
});

// ---- duplicate matching is linear (review finding 4) ------------------

test("identity: 20k identical occurrences match in linear time, cardinality honest", () => {
  const occ = Array.from({ length: 20000 }, (_, i) => ({
    checkKey: "d/r", file: "x.ts", line: i + 1, lineDigest: "same", relColumn: null, contextId: null,
  }));
  const t0 = process.hrtime.bigint();
  const cmp = compareOccurrences(occ, occ);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(cmp.pairs.length, 20000);
  assert.equal(cmp.addedIndices.length, 0);
  assert.equal(cmp.ambiguous, 1, "one duplicate bucket, reported");
  // The old rows.find rescan took ~1.2s at this size; a ceiling keeps the
  // quadratic class from ever returning (generous: CI machines vary).
  assert.ok(ms < 500, `20k duplicates matched in ${ms.toFixed(0)}ms — the cursor must stay linear`);
});
