import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { canRunTui, paintFrame, runTty, truncateVisible, visibleWidth } from "../bin/tty.js";

test("canRunTui: both streams must be terminals", () => {
  assert.equal(canRunTui({ isTTY: true }, { isTTY: true }), true);
  assert.equal(canRunTui({ isTTY: true }, { isTTY: false }), false);
  assert.equal(canRunTui({ isTTY: false }, { isTTY: true }), false);
  assert.equal(canRunTui({}, {}), false, "absent isTTY means not a terminal");
});

test("visibleWidth: ANSI escapes are not counted", () => {
  assert.equal(visibleWidth("\x1b[1mabc\x1b[0m"), 3);
  assert.equal(visibleWidth(""), 0);
});

test("truncateVisible: fits returns as-is; overlong truncates with ellipsis", () => {
  assert.equal(truncateVisible("abc", 5), "abc");
  const out = truncateVisible("abcdefghij", 5);
  assert.equal(out, "abcd…");
  assert.equal(visibleWidth(truncateVisible("\x1b[31mabcdefghij\x1b[0m", 6)), 6);
});

test("paintFrame: payload is wrapped in a synchronized-output window", () => {
  const frames = [];
  paintFrame({ write: (s) => frames.push(s) }, "hello", 40, false);
  assert.ok(frames[0].startsWith("\x1b[?2026h"), "opens DECSET 2026");
  assert.ok(frames[0].includes("\x1b[H"), "homes the cursor");
  assert.ok(frames[0].endsWith("\x1b[?2026l"), "closes DECSET 2026");
});

test("runTty: an identical frame produces zero new bytes", async () => {
  const writes = [];
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin.rawModeHistory = [];
  stdin.setRawMode = (m) => stdin.rawModeHistory.push(m);
  stdin.resume = () => {};
  stdin.pause = () => {};
  const done = runTty({
    stdin,
    stdout: { isTTY: true, columns: 80, write: (s) => writes.push(s) },
    frame: () => "static frame",
    onKey: (key, finish) => { if (key === "q") finish(null); },
  });
  await new Promise((r) => setTimeout(r, 25));
  const afterFirst = writes.length;
  assert.ok(afterFirst >= 1, "the session painted once to start");
  stdin.emit("data", Buffer.from("x"));
  stdin.emit("data", Buffer.from("y"));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(writes.length, afterFirst, "identical frames are skipped entirely");
  stdin.emit("data", Buffer.from("q"));
  const out = await Promise.race([done, new Promise((r) => setTimeout(() => r("pending"), 500))]);
  assert.notEqual(out, "pending");
});
