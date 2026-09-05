import { test } from "node:test";
import assert from "node:assert/strict";

const { pickerFrame, filterPickerItems, pickItemOn } = (await import("../bin/picker.js"));

const items = [
  { id: "unawaited-async-map", label: ".map(async ...) result is never awaited", sub: "repo/unawaited-async-map.mjs", severity: "warning" },
  { id: "no-console-log", label: "console.log left in code", sub: "global/no-console-log.mjs", severity: "info" },
];

test("pickerFrame: header, query line, and items render", () => {
  const out = pickerFrame("Select a doctor", items, 0, "", false);
  assert.match(out, /Select a doctor/);
  assert.match(out, /❯ ▏/);
  assert.match(out, /unawaited-async-map\.mjs/);
  assert.match(out, /no-console-log\.mjs/);
});

test("pickerFrame: selected item is marked", () => {
  const out = pickerFrame("Select a doctor", items, 1, "", false);
  const lines = out.split("\n").filter(l => l.includes("console.log left in code"));
  assert.ok(lines[0].startsWith("❯ "));
});

test("pickerFrame: no matches shows the empty state", () => {
  const out = pickerFrame("Select a doctor", [], 0, "zzz", false);
  assert.match(out, /no matching doctors/);
});

test("pickerFrame: notice survives rendering (copy confirmation)", () => {
  const out = pickerFrame("What next?", items, 0, "", false, "1 finding copied to clipboard — paste into your agent");
  assert.match(out, /✔ 1 finding copied to clipboard — paste into your agent/);
});

test("filterPickerItems: fuzzy query narrows the list", () => {
  const out = filterPickerItems(items, "console");
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "no-console-log");
});


// ---- fake tty: the picker loop through the shared session ----

import { EventEmitter } from "node:events";

class FakeStdin extends EventEmitter {
  isTTY = true;
  isRaw = false;
  rawModeHistory = [];
  resumed = 0;
  paused = 0;
  setRawMode(mode) {
    this.isRaw = mode;
    this.rawModeHistory.push(mode);
  }
  resume() { this.resumed++; }
  pause() { this.paused++; }
  on(event, listener) {
    if (event === "data") this.listenersAttached++;
    return super.on(event, listener);
  }
  listenersAttached = 0;
  send(s) { this.emit("data", Buffer.from(s, "utf8")); }
}

class FakeStdout {
  isTTY = true;
  columns = 120;
  rows = 34;
  frames = [];
  write(s) { this.frames.push(s); }
}

function settle(promise) {
  return Promise.race([
    promise.then((v) => ({ done: true, value: v }), (e) => ({ done: true, error: e })),
    new Promise((r) => setTimeout(() => r({ done: false }), 1000)),
  ]);
}

test("pickItemOn: type-to-filter narrows, enter resolves the match", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = pickItemOn(stdin, stdout, items, false);

  assert.equal(stdin.rawModeHistory[0], true, "enters raw mode");
  assert.ok(stdin.resumed >= 1, "resumes stdin");
  const firstPaint = stdout.frames.find(f => f.includes("\x1b[H"));
  assert.match(firstPaint, /type to filter/);

  stdin.send("cons");
  stdin.send("\r");
  const out = await settle(done);
  assert.ok(out.done, "enter resolves the session");
  assert.equal(out.value.id, "no-console-log", "filtered selection wins");
  assert.equal(stdin.rawModeHistory[stdin.rawModeHistory.length - 1], false, "restores raw mode");
  assert.ok(stdin.paused >= 1, "pauses stdin on finish");
  assert.ok(stdout.frames[stdout.frames.length - 1].includes("\x1b[?25h"), "shows the cursor");
});

test("pickItemOn: down arrow moves the selection, enter takes it", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = pickItemOn(stdin, stdout, items, false);
  stdin.send("\x1b[B");
  const afterDown = stdout.frames[stdout.frames.length - 1];
  assert.match(afterDown, /❯ .*console\.log left in code/, "marker moves to the second item");
  stdin.send("\r");
  const out = await settle(done);
  assert.equal(out.value.id, "no-console-log");
});

test("pickItemOn: esc resolves null and restores the tty", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = pickItemOn(stdin, stdout, items, false);
  stdin.send("\x1b"); // lone escape flushes as "esc" after the key feed hold
  const out = await settle(done);
  assert.ok(out.done, "esc finishes the session");
  assert.equal(out.value, null);
  assert.equal(stdin.rawModeHistory[stdin.rawModeHistory.length - 1], false);
});

test("pickItemOn: backspace widens the query back out", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = pickItemOn(stdin, stdout, items, false);
  stdin.send("zzz");
  assert.match(stdout.frames[stdout.frames.length - 1], /no matching doctors/, "query filters everything out");
  stdin.send("\x7f\x7f\x7f");
  assert.match(stdout.frames[stdout.frames.length - 1], /unawaited-async-map\.mjs/, "query clears");
  stdin.send("\r");
  const out = await settle(done);
  assert.equal(out.value.id, "unawaited-async-map");
});

test("pickItemOn: repaints in place — no full-screen erase after the first paint", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = pickItemOn(stdin, stdout, items, false);
  const first = stdout.frames.find(f => f.includes("\x1b[H"));
  assert.ok(first.startsWith("\x1b[H\x1b[2J"), "first paint clears once");
  stdin.send("c");
  stdin.send("\x7f");
  const later = stdout.frames[stdout.frames.length - 1];
  assert.ok(later.startsWith("\x1b[H"), "later paints home the cursor");
  assert.ok(!later.includes("\x1b[2J"), "later paints never blank the screen");
  assert.ok(later.endsWith("\x1b[J"), "paint clears below the frame");
  stdin.send("\x1b");
  await settle(done);
});

test("pickItemOn: empty item list resolves null without touching the tty", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const out = await pickItemOn(stdin, stdout, [], false);
  assert.equal(out, null);
  assert.equal(stdin.rawModeHistory.length, 0, "never enters raw mode");
  assert.equal(stdout.frames.length, 0, "never paints");
});
