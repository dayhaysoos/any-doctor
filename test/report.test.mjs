import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { renderReport } = require("../bin/report.js");

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
  "Score: 96 / 100 — Excellent",
  "",
  "1 issue found  (1 warning)",
  "Bugs: 1 warning",
  "",
  "⚠ .map(async ...) result is never awaited — the promises are dropped",
  "  unawaited-async-map",
  "  src/services/chat.ts:15",
  "  blind spots: results passed to a helper that awaits them internally",
].join("\n");

test("renderReport: single finding matches golden exactly (plain)", () => {
  assert.equal(renderReport(input, false), golden);
});

test("renderReport: multiple findings show ×N, rollup, and lower the score", () => {
  const out = renderReport({
    fileCount: 6,
    durationMs: 111,
    groups: [{ ...input.groups[0], findings: input.groups[0].findings.concat([{ file: "b.ts", line: 3 }]) }],
  }, false);
  assert.match(out, /Score: 92 \/ 100 — Excellent/);
  assert.match(out, /2 issues found/);
  assert.match(out, /×2/);
  assert.match(out, /b\.ts:3/);
  assert.match(out, /Bugs: 2 warning/);
});

test("renderReport: clean single group scores 100", () => {
  const out = renderReport({ ...input, groups: [{ ...input.groups[0], findings: [] }] }, false);
  assert.match(out, /Score: 100 \/ 100 — Excellent/);
  assert.match(out, /No issues found/);
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
