import { test } from "node:test";
import assert from "node:assert/strict";

const { renderReport } = (await import("../bin/report.js"));

const meta = {
  id: "unawaited-async-map",
  description: ".map(async ...) result is never awaited — the promises are dropped",
  severity: "warning",
  category: "bugs",
  blindSpots: ["results passed to a helper that awaits them internally"],
};

const input = {
  fileCount: 6,
  durationMs: 111,
  groups: [
    {
      programName: "unawaited-async-map.mjs",
      meta,
      findings: [{ file: "src/services/chat.ts", line: 15 }],
    },
  ],
};

const golden = [
  "✔ Scanned 6 files in 111ms",
  "",
  "Any Doctor — 1 doctor",
  "Score: 91 / 100 — Excellent",
  "5/6 files clean",
  "",
  "1 finding  (1 warning)",
  "Bugs: 1 warning",
  "",
  "⚠ .map(async ...) result is never awaited — the promises are dropped",
  "  unawaited-async-map",
  "  src/services/chat.ts:15",
  "",
  "  blind spots: results passed to a helper that awaits them internally",
].join("\n");

test("renderReport: single finding matches golden exactly (plain)", () => {
  assert.equal(renderReport(input, false), golden);
});

test("renderReport: unsafe skips render as one quiet note under the score", () => {
  const out = renderReport({ ...input, skippedUnsafe: ["evil"] }, false);
  assert.match(out, /⚠ 1 doctor could be malicious — skipped: evil/);
  const plural = renderReport({
    fileCount: 6,
    durationMs: 111,
    groups: [],
    skippedUnsafe: ["evil", "worse"],
  }, false);
  assert.match(plural, /2 doctors could be malicious — skipped: evil, worse/);
});

test("renderReport: a flood of unsafe doctors still costs one line", () => {
  const flood = renderReport({
    fileCount: 6,
    durationMs: 111,
    groups: [],
    skippedUnsafe: Array.from({ length: 100 }, (_, i) => "evil-" + i),
  }, false);
  assert.match(flood, /⚠ 100 doctors could be malicious — skipped: evil-0, evil-1, evil-2 … and 97 more/);
});

test("renderReport: multiple findings show ×N, rollup, and lower the score", () => {
  const out = renderReport({
    fileCount: 6,
    durationMs: 111,
    groups: [{ ...input.groups[0], findings: input.groups[0].findings.concat([{ file: "b.ts", line: 3 }]) }],
  }, false);
  assert.match(out, /Score: 83 \/ 100 — Good/);
  assert.match(out, /2 findings/);
  assert.match(out, /×2/);
  assert.match(out, /b\.ts:3/);
  assert.match(out, /Bugs: 2 warning/);
});

test("renderReport: clean single group scores 100", () => {
  const out = renderReport({ ...input, groups: [{ ...input.groups[0], findings: [] }] }, false);
  assert.match(out, /Score: 100 \/ 100 — Excellent/);
  assert.match(out, /No findings/);
});

test("renderReport: an empty scan is a warning, never a green 100", () => {
  const out = renderReport({
    ...input,
    fileCount: 0,
    groups: [{ ...input.groups[0], findings: [] }],
  }, false);
  assert.match(out, /Score: n\/a — no files scanned/);
  assert.match(out, /⚠ nothing to check — no \.ts, \.tsx, \.js, \.jsx, or \.mjs sources found/);
  assert.ok(!out.includes("Excellent"), "an empty scan claims no grade");
  assert.ok(!out.includes("No findings"), "no findings headline over nothing checked");
});

test("renderReport: multiple clean groups list each as clean", () => {
  const out = renderReport({
    fileCount: 6,
    durationMs: 111,
    groups: [
      { programName: "a.mjs", meta, findings: [] },
      { programName: "b.mjs", meta: { ...meta, id: "other" }, findings: [] },
    ],
  }, false);
  assert.match(out, /2 doctors/);
  assert.match(out, /unawaited-async-map — clean/);
  assert.match(out, /other — clean/);
});

test("renderReport: multiple checks group under one doctor with their own headings and severities", () => {
  const out = renderReport({
    fileCount: 9,
    durationMs: 40,
    groups: [
      {
        programName: "stripe-doctor.mjs",
        meta: {
          id: "stripe-doctor",
          description: "Deprecated Stripe usage",
          severity: "warning",
          category: "bugs",
          checks: [
            { id: "charges-create", description: "Direct legacy charge creation", severity: "error" },
            { id: "refunds-legacy", description: "Legacy refund path", severity: "warning" },
          ],
        },
        findings: [
          { rule: "refunds-legacy", file: "src/refund.ts", line: 4 },
          { rule: "charges-create", file: "src/capture-charge.ts", line: 2 },
          { rule: "charges-create", file: "src/capture-charge.ts", line: 9 },
        ],
      },
    ],
  }, false);
  assert.match(out, /Score: 83 \/ 100 — Good/);
  assert.match(out, /✖ Direct legacy charge creation ×2/);
  assert.match(out, /stripe-doctor\/charges-create/);
  assert.match(out, /⚠ Legacy refund path/);
  assert.match(out, /stripe-doctor\/refunds-legacy/);
  assert.match(out, /src\/capture-charge\.ts:2/);
  assert.match(out, /src\/refund\.ts:4/);
  assert.match(out, /Bugs: 2 error, 1 warning/);
});

test("renderReport: cross-doctor duplicates at the same location are hidden once", () => {
  const out = renderReport({
    fileCount: 6,
    durationMs: 111,
    groups: [
      { programName: "unawaited-async-map.mjs", meta, findings: [{ file: "src/services/chat.ts", line: 15 }] },
      { programName: "map-async-variant.mjs", meta: { ...meta, id: "map-async-variant", description: "Async .map results must be wrapped in Promise.all." }, findings: [{ file: "src/services/chat.ts", line: 15 }] },
    ],
  }, false);
  assert.match(out, /1 finding/);
  assert.match(out, /1 duplicate finding hidden/);
  assert.match(out, /Score: 91/);
  const occurrences = out.split("chat.ts:15").length - 1;
  assert.equal(occurrences, 1);
});

test("renderReport with color: the score header carries no function source", async () => {
  const { renderReport } = await import("../bin/report.js");
  const groups = [{ programName: "d.mjs", meta: { id: "d", description: "x", severity: "warning" }, findings: [{ file: "a.ts", line: 1 }] }];
  const out = renderReport({ fileCount: 1, durationMs: 5, groups }, true);
  assert.ok(!out.includes("function gradeColor"), "gradeColor is called, not concatenated");
  assert.ok(out.includes("Score:"), "score header present");
});

test("renderReport: a second check from the SAME doctor at one site survives dedupe (different diagnosis, different story)", () => {
  const out = renderReport({
    fileCount: 6,
    durationMs: 111,
    groups: [{
      programName: "convex-doctor.mjs",
      meta: {
        id: "convex-doctor",
        description: "x",
        severity: "warning",
        checks: [
          { id: "filter-table-scan", description: "Filter scans the table", severity: "warning" },
          { id: "unbounded-collect", description: "Collect is unbounded", severity: "warning" },
        ],
      },
      findings: [
        { rule: "filter-table-scan", file: "src/list.ts", line: 5 },
        { rule: "unbounded-collect", file: "src/list.ts", line: 5 },
      ],
    }],
  }, false);
  assert.match(out, /2 findings/);
  assert.ok(!out.includes("duplicate finding hidden"), "same-doctor same-site is not a duplicate");
});

test("renderReport: checks that need analysis say narrowed when the engine was absent (D20 Stage 2)", () => {
  const outcome = (analysisAvailable) => ({
    fileCount: 3,
    durationMs: 10,
    analysisAvailable,
    groups: [{
      programName: "async-doctor.mjs",
      meta: {
        id: "async-doctor",
        description: "Async discipline",
        severity: "warning",
        checks: [
          { id: "unawaited-async-map", description: ".map(async ...) dropped", severity: "warning", needs: ["bindings"] },
          { id: "fetch-calls-without-abortsignal", description: "Fetch without AbortSignal", severity: "warning" },
        ],
      },
      findings: [{ rule: "fetch-calls-without-abortsignal", file: "src/a.ts", line: 2 }],
    }],
  });
  const narrowed = renderReport(outcome(false), false);
  assert.match(narrowed, /narrowed: analysis engine unavailable — unawaited-async-map ran in degraded mode/);
  // the needs-less check is never accused of narrowing
  assert.doesNotMatch(narrowed, /fetch-calls-without-abortsignal ran in degraded/);
  const fullPower = renderReport(outcome(true), false);
  assert.doesNotMatch(fullPower, /narrowed/);
});
