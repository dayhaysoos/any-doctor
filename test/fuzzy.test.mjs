import { test } from "node:test";
import assert from "node:assert/strict";

const { fuzzyScore, fuzzyFilter } = (await import("../bin/fuzzy.js"));

test("fuzzyScore: non-match scores zero", () => {
  assert.equal(fuzzyScore("xyz", "no-console-log"), 0);
});

test("fuzzyScore: subsequence match scores positive", () => {
  assert.ok(fuzzyScore("async", "unawaited-async-map") > 0);
});

test("fuzzyScore: consecutive runs outrank same-structure scatter", () => {
  assert.ok(fuzzyScore("con", "console-log") > fuzzyScore("con", "cot-ln-op"));
});

test("fuzzyFilter: filters non-matches and sorts by score desc", () => {
  const items = ["unawaited-async-map", "no-console-log", "no-empty-catch"];
  const out = fuzzyFilter(items, x => x, "no");
  assert.ok(out.length >= 2);
  assert.ok(out.every(i => fuzzyScore("no", i) > 0));
  assert.ok(fuzzyScore("no", out[0]) >= fuzzyScore("no", out[out.length - 1]));
});

test("fuzzyFilter: empty query keeps original order", () => {
  const items = ["b", "a"];
  assert.deepEqual(fuzzyFilter(items, x => x, "  "), items);
});
