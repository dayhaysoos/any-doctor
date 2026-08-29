import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { renderReport } = require("../bin/report.js");

const input = {
  programName: "unawaited-async-map.mjs",
  description: ".map(async ...) result is never awaited — the promises are dropped",
  severity: "warning",
  blindSpots: ["results passed to a helper that awaits them internally"],
  fileCount: 6,
  durationMs: 111,
  findings: [{ file: "src/services/chat.ts", line: 15 }],
};

const golden = [
  "✔ Scanned 6 files in 111ms",
  "",
  "Any Doctor — unawaited-async-map.mjs",
  "",
  "1 issue found  (1 warning)",
  "",
  "⚠ .map(async ...) result is never awaited — the promises are dropped",
  "  unawaited-async-map",
  "  src/services/chat.ts:15",
  "",
  "  Known blind spots:",
  "  - results passed to a helper that awaits them internally",
].join("\n");

test("renderReport: single finding matches golden exactly (plain)", () => {
  assert.equal(renderReport(input, false), golden);
});

test("renderReport: multiple findings show ×N and rollup", () => {
  const out = renderReport({ ...input, findings: input.findings.concat([{ file: "b.ts", line: 3 }]) }, false);
  assert.match(out, /2 issues found/);
  assert.match(out, /×2/);
  assert.match(out, /b\.ts:3/);
});

test("renderReport: clean run says so", () => {
  const out = renderReport({ ...input, findings: [] }, false);
  assert.match(out, /No issues found/);
  assert.doesNotMatch(out, /\d+ issue/);
});
