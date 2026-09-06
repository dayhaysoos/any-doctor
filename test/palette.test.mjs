import { test } from "node:test";
import assert from "node:assert/strict";
import { GLYPH, SEVERITY_COLOR, colorizer, gradeColor, RED, GREEN, YELLOW } from "../bin/palette.js";
import { gradeFor } from "../bin/score.js";

test("severity palette: one glyph and color map, error is RED everywhere", () => {
  assert.deepEqual(GLYPH, { error: "✖", warning: "⚠", info: "ℹ" });
  assert.equal(SEVERITY_COLOR.error, RED, "the picker's green error glyph is dead");
  assert.equal(SEVERITY_COLOR.warning[0], "\x1b");
});

test("colorizer: wraps only when color is on", () => {
  const plain = colorizer(false);
  const loud = colorizer(true);
  assert.equal(plain("x", RED), "x");
  assert.equal(loud("x", RED), RED + "x" + "\x1b[0m");
});

test("gradeColor derives from score.ts bands, never shadows them", () => {
  assert.equal(gradeColor(100), GREEN);   // Excellent
  assert.equal(gradeColor(75), GREEN);    // Good
  assert.equal(gradeColor(50), YELLOW);   // Fair
  assert.equal(gradeColor(25), RED);      // Poor
  assert.equal(gradeFor(75), "Good");
});

test("pickerFrame renders error severity in RED, not green", async () => {
  const { pickerFrame } = await import("../bin/picker.js");
  const out = pickerFrame("t", [{ id: "x", label: "L", severity: "error" }], 0, "", true);
  assert.ok(out.includes(RED + "✖"), "error glyph is red");
});
