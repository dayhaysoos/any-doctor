import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

// The clipboard is injected via deps in runDashboardOn tests, keeping them
// deterministic and spawn-free.
const { buildItems, buildListRows, issuePrompt, scoreBar, runDashboardOn, dashboardFrame } = await import("../bin/dashboard.js");
const copyAlways = { copy: () => true };

const groups = [
  {
    programName: "stripe-doctor.mjs",
    meta: {
      id: "stripe-doctor",
      description: "Deprecated Stripe usage",
      severity: "warning",
      category: "bugs",
      checks: [
        { id: "charges-create", description: "Direct legacy charge creation", severity: "error", impact: "money moves wrong", why: "charges.create is legacy", fix: "use paymentIntents" },
      ],
      blindSpots: ["aliased clients"],
    },
    findings: [
      { rule: "charges-create", file: "src/a.ts", line: 2 },
      { rule: "charges-create", file: "src/a.ts", line: 9 },
    ],
  },
  {
    programName: "other.mjs",
    meta: { id: "other", description: "Other checks", severity: "info" },
    findings: [{ file: "src/b.ts", line: 7 }],
  },
];

test("buildItems: one item per finding instance, not per check", () => {
  const items = buildItems(groups);
  assert.equal(items.length, 3);
  assert.equal(items[0].key, "stripe-doctor/charges-create@src/a.ts:2");
  assert.equal(items[1].key, "stripe-doctor/charges-create@src/a.ts:9");
  assert.equal(items[0].site.file, "src/a.ts");
  assert.equal(items[0].site.line, 2);
  assert.equal(items[0].checkKey, "stripe-doctor/charges-create");
  assert.equal(items[0].description, "Direct legacy charge creation");
  assert.equal(items[0].impact, "money moves wrong");
  assert.equal(items[2].doctorId, "other");
});

test("buildListRows: section rows per doctor, item rows per instance", () => {
  const items = buildItems(groups);
  const rows = buildListRows(items, false, 0, new Set());
  assert.equal(rows.filter(r => r.kind === "section").length, 2);
  assert.equal(rows.filter(r => r.kind === "item").length, 3);
  assert.equal(rows[0].kind, "section");
  assert.equal(rows[0].text, "stripe-doctor");
  assert.equal(rows[3].text, "other");
});

test("issuePrompt: per-instance scope with single affected site", () => {
  const items = buildItems(groups);
  const prompt = issuePrompt(items[0], "any-doctor verify doctors/stripe-doctor.mjs");
  assert.match(prompt, /Fix exactly one any-doctor check/);
  assert.match(prompt, /ERROR · Direct legacy charge creation \(stripe-doctor\/charges-create\)/);
  assert.match(prompt, /Affected site: src\/a\.ts:2/);
  assert.doesNotMatch(prompt, /src\/a\.ts:9/);
  assert.match(prompt, /Impact money moves wrong/);
  assert.match(prompt, /Why charges\.create is legacy/);
  assert.match(prompt, /Suggested fix: use paymentIntents/);
  assert.match(prompt, /Fix only stripe-doctor\/charges-create at this site\./);
});

test("scoreBar: fills proportionally", () => {
  assert.equal(scoreBar(100, 10), "██████████");
  assert.equal(scoreBar(0, 10), "░░░░░░░░░░");
  assert.equal(scoreBar(50, 10), "█████░░░░░");
});

class FakeStdin extends EventEmitter {
  isTTY = true;
  isRaw = false;
  rawModeHistory = [];
  resumed = 0;
  paused = 0;
  listenersAttached = 0;
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
  send(s) { this.emit("data", Buffer.from(s, "utf8")); }
}

class FakeStdout {
  isTTY = true;
  columns = 120;
  rows = 34;
  frames = [];
  write(s) { this.frames.push(s); }
}

function dashInput() {
  return {
    root: ".",
    groups,
    doctorFile: "doctors/stripe-doctor.mjs",
    fileCount: 2,
    durationMs: 10,
    useColor: false,
  };
}

function settle(promise) {
  return Promise.race([
    promise.then(() => "resolved", (e) => "rejected: " + e),
    new Promise((r) => setTimeout(() => r("still pending"), 1000)),
  ]);
}

test("runDashboard: revives a post-picker stdin (paused, cooked) and stays interactive until q", async () => {
  const stdin = new FakeStdin(); // models stdin exactly as pickItem's cleanup leaves it
  const stdout = new FakeStdout();
  const done = runDashboardOn(stdin, stdout, dashInput(), copyAlways);

  assert.equal(stdin.rawModeHistory[0], true, "must enter raw mode before reading keys (cooked mode line-buffers arrows and echoes)");
  assert.ok(stdin.resumed >= 1, "must resume stdin — the picker pauses it, and an explicitly paused stdin never auto-flows, so the loop drains and the process exits 0");
  assert.match(stdout.frames[stdout.frames.length - 1], /enter copy issue context/);

  stdin.send("\x1b[B");
  const afterDown = stdout.frames[stdout.frames.length - 1];
  assert.match(afterDown, /›✖ src\/a\.ts:9/, "down arrow moves selection to the second instance");

  stdin.send("\r");
  const afterEnter = stdout.frames[stdout.frames.length - 1];
  assert.match(afterEnter, /copied issue context/, "enter copies issue context and keeps the dashboard open");
  assert.doesNotMatch(afterEnter, /DASHBOARD RENDER ERROR/);

  stdin.send("q");
  assert.equal(await settle(done), "resolved", "q must resolve the dashboard loop (finish wiring)");
  assert.equal(stdin.rawModeHistory[stdin.rawModeHistory.length - 1], false, "restores previous raw mode on exit");
  assert.ok(stdin.paused >= 1, "pauses stdin on exit");
  assert.ok(stdout.frames[stdout.frames.length - 1].includes("\x1b[?25h"), "shows the cursor again on exit");
});

test("runDashboard: ctrl-c exits the loop like q", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = runDashboardOn(stdin, stdout, dashInput(), copyAlways);
  stdin.send("\x03");
  assert.equal(await settle(done), "resolved");
});

test("runDashboard: enter on an empty findings list draws instead of crashing", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = runDashboardOn(stdin, stdout, { ...dashInput(), groups: [{ ...groups[0], findings: [] }] }, copyAlways);
  stdin.send("\r");
  assert.doesNotMatch(stdout.frames[stdout.frames.length - 1], /DASHBOARD RENDER ERROR/);
  stdin.send("q");
  assert.equal(await settle(done), "resolved");
});

test("dashboardFrame: frame height is exactly rows - 1 in every state (notice never resizes it)", () => {
  const items = buildItems(groups);
  const height = (notice, cols, selected) =>
    dashboardFrame({ items, selected, readKeys: new Set(), readSource: () => null, fileCount: 2, durationMs: 10, useColor: false, notice, cols, rows: 34 })
      .split("\n").length;
  assert.equal(height(undefined, 120, 0), 33, "split, no notice");
  assert.equal(height("copied issue context — paste into your agent", 120, 0), 33, "split, with notice");
  assert.equal(height(undefined, 120, 2), 33, "split, last item selected");
  assert.equal(height(undefined, 80, 0), 33, "stacked, no notice");
  assert.equal(height("copied", 80, 0), 33, "stacked, with notice");
});

test("runDashboard: repaints in place — no full-screen erase after the first paint", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = runDashboardOn(stdin, stdout, dashInput(), copyAlways);

  const paints = stdout.frames.filter(f => f.includes("\x1b[H"));
  assert.ok(paints.length >= 1, "at least one paint happened");
  const first = paints[0];
  assert.ok(first.startsWith("\x1b[?2026h\x1b[H"), "first paint is in-place too — the picker's leftovers are overwritten, not blanked");

  stdin.send("\x1b[B");
  stdin.send("\r");
  const later = stdout.frames[stdout.frames.length - 1];
  assert.ok(later.startsWith("\x1b[?2026h\x1b[H"), "later paints home the cursor, synchronized");
  assert.ok(!later.includes("\x1b[2J"), "later paints never blank the whole screen");
  assert.ok(later.includes("\x1b[K"), "each rewritten line clears to end-of-line");
  assert.ok(later.endsWith("\x1b[J\x1b[?2026l"), "paint clears below the frame and closes the synchronized window");

  stdin.send("q");
  assert.equal(await settle(done), "resolved");
});

test("dashboardFrame: pure state -> string; code frames come from the injected source", async () => {
  const items = buildItems(groups);
  const source = ["one", "two", "const three = 3", "four", "five"];
  const readSource = (file) => (file === "src/a.ts" ? source : null);
  const state = { items, selected: 0, readKeys: new Set(), readSource, fileCount: 2, durationMs: 10, useColor: false, cols: 120, rows: 34 };

  const once = dashboardFrame(state);
  assert.equal(dashboardFrame(state), once, "same state, same frame — no hidden I/O");
  assert.match(once, /> +2 │ two/, "code frame renders the injected source with the marker line");
  const bare = dashboardFrame({ ...state, readSource: () => null });
  assert.match(bare, /\(source unavailable\)/, "a file with no source renders the fallback");
});
