import { test } from "node:test";
import assert from "node:assert/strict";
import { maskNonCode } from "../bin/mask.js";

test("maskNonCode: regex literals containing quotes no longer open phantom strings", () => {
  const src = [
    'const TOKEN_RE = /(\\/\\/.*$)|(\'[^\']*\'|"[^"]*")|\\b(case)\\b/g;',
    "export function buildItems(groups: ReportGroup[]): number {",
    "  return groups.length / 2;",
    "}",
  ].join("\n");
  const masked = maskNonCode(src);
  assert.equal(masked.length, src.length, "offsets preserved");
  assert.ok(masked.includes("TOKEN_RE"), "the regex identifier survives");
  assert.ok(!masked.includes("//.*$"), "the regex body is masked");
  assert.ok(masked.includes("ReportGroup"), "code after a quote-bearing regex is NOT swallowed");
  assert.ok(masked.includes("/ 2"), "division after a regex literal still reads as division");
});
