import { test } from "node:test";
import assert from "node:assert/strict";

// The Summary is the derivation both surfaces render — its interface is
// the test surface for "the report and the dashboard can never
// disagree." These tests pin the derived facts as data (the CI
// chapter's --fail-on and baselines will consume exactly these fields);
// the adapters' own tests pin the rendering.

const { deriveSummary } = await import("../bin/summary.js");

const meta = (id, over = {}) => ({ id, description: "x", severity: "warning", ...over });
const outcome = (over = {}) => ({
  fileCount: 6,
  durationMs: 111,
  crashed: [],
  groups: [],
  ...over,
});

test("deriveSummary: empty outcome derives an emptyScan with no score claim", () => {
  const s = deriveSummary(outcome({ fileCount: 0, groups: [{ programName: "a.mjs", meta: meta("a"), findings: [] }] }));
  assert.equal(s.emptyScan, true);
  assert.equal(s.total, 0);
  assert.equal(s.header.emptyScan, true);
  assert.equal(s.header.scoreLine, "Score: n/a — no files scanned");
});

test("deriveSummary: severity counts, total, and category rollup as data", () => {
  const s = deriveSummary(outcome({
    groups: [{
      programName: "a.mjs",
      meta: meta("a", { category: "bugs" }),
      findings: [
        { file: "a.ts", line: 1 },
        { file: "a.ts", line: 2 },
        { file: "b.ts", line: 3, severity: "error" },
      ],
    }],
  }));
  assert.equal(s.total, 3);
  assert.deepEqual(s.severityCounts, { error: 1, warning: 2, info: 0 });
  assert.deepEqual(s.categories, [{ category: "bugs", counts: { error: 1, warning: 2, info: 0 } }]);
  assert.equal(s.emptyScan, false);
});

test("deriveSummary: cross-doctor duplicates hide; the owner's second diagnosis survives", () => {
  const s = deriveSummary(outcome({
    groups: [
      {
        programName: "a.mjs",
        meta: meta("a"),
        // Two checks from ONE doctor at one site: both diagnoses render —
        // the owner's second look at its own line is a different finding,
        // not a duplicate.
        findings: [
          { file: "a.ts", line: 1, rule: "x" },
          { file: "a.ts", line: 1, rule: "y" },
          { file: "b.ts", line: 2 },
        ],
      },
      { programName: "b.mjs", meta: meta("b"), findings: [{ file: "a.ts", line: 1 }] },
    ],
  }));
  assert.equal(s.total, 3, "a's two diagnoses and b.ts survive; b's cross-doctor copy hides");
  assert.equal(s.hidden, 1);
});

test("deriveSummary: check buckets and narrowed ids ride per group", () => {
  const s = deriveSummary(outcome({
    analysisAvailable: false,
    groups: [{
      programName: "a.mjs",
      meta: meta("a", {
        checks: [
          { id: "unawaited-async-map", description: ".map(async ...) dropped", severity: "warning", needs: ["bindings"] },
          { id: "fetch-calls-without-abortsignal", description: "Fetch without AbortSignal", severity: "warning" },
        ],
      }),
      findings: [
        { rule: "unawaited-async-map", file: "a.ts", line: 1 },
        { rule: "unawaited-async-map", file: "a.ts", line: 5 },
        { rule: "fetch-calls-without-abortsignal", file: "b.ts", line: 2 },
      ],
    }],
  }));
  const gc = s.groupChecks[0];
  assert.equal(gc.checks.length, 2, "findings bucket by checkKey");
  const byRule = Object.fromEntries(gc.checks.map(b => [b.ruleId, b]));
  assert.equal(byRule["unawaited-async-map"].findings.length, 2);
  assert.deepEqual(gc.narrowedIds, ["unawaited-async-map"], "only the needs-declaring check is narrowed");
});

test("deriveSummary: pure — deriving twice from one outcome yields equal summaries", () => {
  const o = outcome({
    groups: [{ programName: "a.mjs", meta: meta("a"), findings: [{ file: "a.ts", line: 1 }] }],
  });
  assert.deepEqual(deriveSummary(o), deriveSummary(o));
});
