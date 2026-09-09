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

test("maskNonCode: a JSX closing tag's slash is not a regex opener", () => {
  const src = [
    'import { Button } from "./ui";',
    "export default function Demo() { return <div><span>Hi</span><Button /></div>; }",
  ].join("\n");
  const masked = maskNonCode(src);
  assert.ok(masked.includes("Button"), "JSX component reference survives masking");
  assert.ok(masked.includes("Demo"), "code after the first closing tag survives");
});
