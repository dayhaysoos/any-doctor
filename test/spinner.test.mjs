import { test } from "node:test";
import assert from "node:assert/strict";

// The spinner is a pure frame plus a thin timer controller — the frame
// is golden-tested, the controller is driven by a fake stdout and a fake
// clock so the test never sleeps.

const { spinnerLine, startSpinner, formatMs } = await import("../bin/spinner.js");

const strip = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\r/g, "");

test("spinnerLine: glyph cycles, counts and note render, elapsed formats", () => {
  const line = spinnerLine(3, { label: "running doctors", done: 2, total: 4, elapsedMs: 1200, note: "async" });
  assert.equal(strip(line), "⠸ running doctors · 2 of 4 done · async · 1.2s");
  assert.equal(strip(spinnerLine(4, { label: "x", done: 0, total: 1, elapsedMs: 40 })), "⠼ x · 0 of 1 done · 40ms");
  // cycles, never out of range
  for (const t of [0, 9, 10, 23]) assert.ok(spinnerLine(t, { label: "x", done: 0, total: 0, elapsedMs: 0 }).length > 0);
  // total 0 (nothing selected yet) omits the count segment
  assert.equal(strip(spinnerLine(0, { label: "x", done: 0, total: 0, elapsedMs: 0 })), "⠋ x · 0ms");
});

test("formatMs: under a second in ms, above in tenths of seconds", () => {
  assert.equal(formatMs(40), "40ms");
  assert.equal(formatMs(999), "999ms");
  assert.equal(formatMs(1200), "1.2s");
  assert.equal(formatMs(65400), "65.4s");
});

class FakeStdout {
  isTTY = true;
  columns = 120;
  writes = [];
  write(s) { this.writes.push(s); }
  last() { return this.writes[this.writes.length - 1]; }
}

test("startSpinner: hides the cursor, repaints in place, update() reflects state, stop() cleans the line", async () => {
  const out = new FakeStdout();
  let clock = 1000;
  const spin = startSpinner(out, { label: "running doctors", total: 4 }, { delayMs: 10, now: () => clock });
  try {
    assert.ok(out.writes[0].includes("\x1b[?25l"), "cursor hidden on start");
    assert.match(strip(out.last()), /^⠋ running doctors · 0 of 4 done · 0ms$/);

    clock = 1080;
    spin.update({ done: 2, note: "async" });
    assert.match(strip(out.last()), /^⠋ running doctors · 2 of 4 done · async · 80ms$/);
    assert.ok(out.last().includes("\r\x1b[2K"), "repaints the single line in place");
    assert.ok(out.last().startsWith("\x1b[?2026h"), "synchronized output wraps the paint");

    // the timer keeps the line alive between completions (elapsed ticks)
    await new Promise((r) => setTimeout(r, 30));
    const ticks = out.writes.filter((w) => w.includes("⠙") || w.includes("⠹"));
    assert.ok(ticks.length > 0, "interval advanced the glyph");
    assert.match(strip(out.last()), /\d+ms$/, "elapsed refreshes");
  } finally {
    spin.stop();
  }
  assert.equal(out.last(), "\r\x1b[2K\x1b[?25h", "stop clears the line and restores the cursor");
});
