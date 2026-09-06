import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

// The clipboard is injected via deps in runDashboardOn tests, keeping them
// deterministic and spawn-free.
const { buildItems, buildTree, buildListRows, fixPrompt, scoreBar, runDashboardOn, dashboardFrame } = await import("../bin/dashboard.js");
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
  assert.equal(items[0].readKey, "stripe-doctor/charges-create@src/a.ts:2");
  assert.equal(items[1].readKey, "stripe-doctor/charges-create@src/a.ts:9");
  assert.equal(items[0].site.file, "src/a.ts");
  assert.equal(items[0].site.line, 2);
  assert.equal(items[0].checkKey, "stripe-doctor/charges-create");
  assert.equal(items[0].description, "Direct legacy charge creation");
  assert.equal(items[0].impact, "money moves wrong");
  assert.equal(items[2].doctorId, "other");
});

test("buildListRows: multi-doctor frames render collapsible doctor rows", async () => {
  const { initialExpanded } = await import("../bin/dashboard.js");
  const items = buildItems(groups);
  const expanded = initialExpanded(buildTree(items));
  assert.ok(expanded.has("stripe-doctor"), "the error-carrying top doctor opens on entry");
  assert.ok(!expanded.has("other"), "the info-only doctor starts collapsed");
  const rows = buildListRows(buildTree(items), false, 0, new Set(), expanded);
  assert.deepEqual(rows.map(r => r.kind), ["section", "item", "item", "section"]);
  assert.match(rows[0].text, /stripe-doctor ×2/);
  assert.ok(rows[0].selectable, "doctor rows are the selection surface");
  assert.match(rows[3].text, /other ×1/);
  assert.ok(rows[3].text.includes("\u25b8"), "other collapsed");
  const opened = buildListRows(buildTree(items), false, 0, new Set(), new Set([...expanded, "other"]));
  assert.ok(opened.some(r => r.text.includes("src/b.ts:7")), "expanding a doctor reveals its findings");
});

test("fixPrompt: verify command resolves through doctorPath (the fixture field is load-bearing)", () => {
  const items = buildItems(groups);
  const prompt = fixPrompt(items[0], "any-doctor run doctors/stripe-doctor.mjs .");
  assert.match(prompt, /Verify with `any-doctor run doctors\/stripe-doctor\.mjs \.`/);
});

test("fixPrompt: per-finding scope with single affected site", () => {
  const items = buildItems(groups);
  const prompt = fixPrompt(items[0], "any-doctor verify doctors/stripe-doctor.mjs");
  assert.match(prompt, /Fix exactly one any-doctor finding/);
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

function dashInput(groupsOverride = groups) {
  return {
    outcome: {
      groups: groupsOverride,
      crashed: [],
      skippedUnsafe: [],
      doctorPaths: new Map(),
      fileCount: 2,
      durationMs: 10,
      targetDir: ".",
    },
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
  const done = runDashboardOn({ stdin, stdout }, dashInput(), copyAlways);

  assert.equal(stdin.rawModeHistory[0], true, "must enter raw mode before reading keys (cooked mode line-buffers arrows and echoes)");
  assert.ok(stdin.resumed >= 1, "must resume stdin — the picker pauses it, and an explicitly paused stdin never auto-flows, so the loop drains and the process exits 0");
  assert.match(stdout.frames[stdout.frames.length - 1], /enter copy finding/);

  stdin.send("\x1b[B");
  stdin.send("\x1b[B");
  const afterDown = stdout.frames[stdout.frames.length - 1];
  assert.match(afterDown, /›✖ src\/a\.ts:9/, "down arrows walk from the doctor row onto its second instance");

  stdin.send("\r");
  const afterEnter = stdout.frames[stdout.frames.length - 1];
  assert.match(afterEnter, /copied finding/, "enter copies the finding and keeps the dashboard open");
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
  const done = runDashboardOn({ stdin, stdout }, dashInput(), copyAlways);
  stdin.send("\x03");
  assert.equal(await settle(done), "resolved");
});

test("runDashboard: enter on an empty findings list draws instead of crashing", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = runDashboardOn({ stdin, stdout }, { ...dashInput(), groups: [{ ...groups[0], findings: [] }] }, copyAlways);
  stdin.send("\r");
  assert.doesNotMatch(stdout.frames[stdout.frames.length - 1], /DASHBOARD RENDER ERROR/);
  stdin.send("q");
  assert.equal(await settle(done), "resolved");
});

test("dashboardFrame: unsafe skips appear as one header note line", () => {
  const items = buildItems(groups);
  const frame = dashboardFrame({
    tree: buildTree(items),
    selectedRow: 0,
    readKeys: new Set(),
    readSource: () => null,
    fileCount: 2,
    durationMs: 10,
    useColor: false,
    skippedUnsafe: ["evil"],
    cols: 120,
    rows: 34,
  });
  assert.match(frame, /⚠ 1 doctor could be malicious — skipped: evil/);
});

test("dashboardFrame: frame height is exactly rows - 1 in every state (notice never resizes it)", () => {
  const items = buildItems(groups);
  const height = (notice, cols, selected) =>
    dashboardFrame({ tree: buildTree(items), selectedRow: selected, readKeys: new Set(), readSource: () => null, fileCount: 2, durationMs: 10, useColor: false, notice, cols, rows: 34 })
      .split("\n").length;
  assert.equal(height(undefined, 120, 0), 33, "split, no notice");
  assert.equal(height("copied finding — paste into your agent", 120, 0), 33, "split, with notice");
  assert.equal(height(undefined, 120, 2), 33, "split, last item selected");
  assert.equal(height(undefined, 80, 0), 33, "stacked, no notice");
  assert.equal(height("copied", 80, 0), 33, "stacked, with notice");
});

test("runDashboard: repaints in place — no full-screen erase after the first paint", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = runDashboardOn({ stdin, stdout }, dashInput(), copyAlways);

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
  const state = { tree: buildTree(items), selectedRow: 1, readKeys: new Set(), readSource, expanded: new Set(["stripe-doctor"]), fileCount: 2, durationMs: 10, useColor: false, cols: 120, rows: 34 };

  const once = dashboardFrame(state);
  assert.equal(dashboardFrame(state), once, "same state, same frame — no hidden I/O");
  assert.match(once, /> +2 │ two/, "code frame renders the injected source with the marker line");
  const bare = dashboardFrame({ ...state, readSource: () => null });
  assert.match(bare, /\(source unavailable\)/, "a file with no source renders the fallback");
});

test("dashboardFrame with color: header carries no function source", () => {
  const items = buildItems(groups);
  const out = dashboardFrame({ tree: buildTree(items), selectedRow: 0, readKeys: new Set(), readSource: () => null, fileCount: 2, durationMs: 10, useColor: true, cols: 120, rows: 34 });
  assert.ok(!out.includes("function gradeColor"), "gradeColor is called, not concatenated");
});

// ---- the check tree: multi-check doctors ----

const multiGroups = [{
  programName: "multi.mjs",
  meta: {
    id: "multi-doctor",
    description: "Multi-check doctor",
    severity: "warning",
    checks: [
      { id: "bad-error", description: "Error check", severity: "error", why: "because", impact: "bad", fix: "fix it" },
      { id: "meh-warn", description: "Warning check", severity: "warning" },
    ],
  },
  findings: [
    { rule: "bad-error", file: "a.ts", line: 1 },
    { rule: "bad-error", file: "a.ts", line: 2 },
    { rule: "meh-warn", file: "b.ts", line: 3 },
  ],
}];

test("tree: checks render as severity-ordered rows; errors start expanded, warnings collapsed", async () => {
  const { buildListRows, buildItems, initialExpanded } = await import("../bin/dashboard.js");
  const items = buildItems(multiGroups);
  const expanded = initialExpanded(buildTree(items));
  assert.deepEqual([...expanded], ["multi-doctor/bad-error"], "only the error check opens on entry");
  const rows = buildListRows(buildTree(items), false, 0, new Set(), expanded);
  assert.deepEqual(rows.map(r => r.kind), ["section", "check", "item", "item", "check"]);
  assert.match(rows[1].text, /Error check/, "error check first (severity ordering)");
  assert.match(rows[1].text, /×2/);
  assert.ok(rows[1].text.includes("\u25be"), "error check expanded");
  assert.match(rows[4].text, /Warning check ×1/);
  assert.ok(rows[4].text.includes("\u25b8"), "warning check collapsed");
  assert.ok(!rows.some(r => r.text.includes("b.ts")), "warning instances hidden until expanded");
});

test("tree: expanding a warning check reveals its instances in the frame", async () => {
  const { buildItems, dashboardFrame, initialExpanded } = await import("../bin/dashboard.js");
  const items = buildItems(multiGroups);
  const base = { tree: buildTree(items), selectedRow: 1, readKeys: new Set(), readSource: () => null, fileCount: 1, durationMs: 5, useColor: false, cols: 120, rows: 34 };
  const closed = dashboardFrame({ ...base, expanded: initialExpanded(buildTree(items)) });
  assert.ok(closed.includes("a.ts:1") && !closed.includes("b.ts:3"));
  const open = dashboardFrame({ ...base, expanded: new Set(["multi-doctor/bad-error", "multi-doctor/meh-warn"]) });
  assert.ok(open.includes("b.ts:3"));
});

test("tree: a check row's detail pane tells the check's story", async () => {
  const { buildItems, dashboardFrame, initialExpanded } = await import("../bin/dashboard.js");
  const items = buildItems(multiGroups);
  const out = dashboardFrame({ tree: buildTree(items), selectedRow: 1, readKeys: new Set(), readSource: () => null, expanded: initialExpanded(buildTree(items)), fileCount: 1, durationMs: 5, useColor: false, cols: 120, rows: 34 });
  assert.ok(out.includes("multi-doctor/bad-error"), "checkKey in the detail pane");
  assert.ok(out.includes("2 findings across 1 file"), "blast radius");
  assert.ok(out.includes("because"), "why text");
});

test("tree: 60 findings in one check show 50 instances plus the re-scan affordance", async () => {
  const { buildListRows, buildItems, initialExpanded, FINDINGS_PER_CHECK } = await import("../bin/dashboard.js");
  assert.equal(FINDINGS_PER_CHECK, 50);
  const findings = Array.from({ length: 60 }, (_, i) => ({ rule: "bad-error", file: "a.ts", line: i + 1 }));
  const items = buildItems([{ ...multiGroups[0], findings: [...findings, { rule: "meh-warn", file: "b.ts", line: 3 }] }]);
  const rows = buildListRows(buildTree(items), false, 0, new Set(), initialExpanded(buildTree(items)));
  const kinds = rows.map(r => r.kind);
  assert.equal(kinds.filter(k => k === "item").length, 50, "instances capped");
  const more = rows.find(r => r.kind === "more");
  assert.ok(more && more.text.includes("10 more"), "the more-row counts the rest");
  assert.ok(more.text.includes("re-scan"), "the affordance names the loop");
});

test("tree: single-doctor frames stay exactly flat — headers, no tree", async () => {
  const { buildListRows, buildItems, initialExpanded } = await import("../bin/dashboard.js");
  const items = buildItems([groups[0]]); // one doctor, one check
  assert.deepEqual([...initialExpanded(buildTree(items))], [], "nothing to expand in a single-doctor frame");
  const rows = buildListRows(buildTree(items), false, 0, new Set(), initialExpanded(buildTree(items)));
  assert.deepEqual(rows.map(r => r.kind), ["section", "item", "item"]);
  assert.ok(!rows[0].selectable, "the header is not a toggle in single-doctor frames");
  assert.ok(!rows.some(r => r.kind === "check" || r.kind === "more"), "no tree for one check");
});

test("tree: enter toggles checks, arrows expand and collapse, enter on an instance copies", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const multiInput = { ...dashInput(multiGroups) };
  const done = runDashboardOn({ stdin, stdout }, multiInput, copyAlways);

  // Initial selection is the (expanded) error check row.
  let frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.ok(frame.includes("a.ts:1"), "error check open at entry");

  stdin.send("\r"); // collapse the error check
  frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.ok(!frame.includes("a.ts:1"), "enter collapsed it");

  stdin.send("j");   // onto the warning check row
  stdin.send("\x1b[C"); // right expands
  frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.ok(frame.includes("b.ts:3"), "right arrow expanded the warning check");

  stdin.send("j");   // onto the instance row
  stdin.send("\r"); // copies
  frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.ok(frame.includes("copied finding"), "enter on an instance copies its context");

  stdin.send("q");
  const out = await settle(done);
  assert.equal(out, "resolved");
});

// ---- the aggregate experience: no-arg run, every doctor in one tree ----

const aggregateGroups = [
  { ...multiGroups[0] },
  { programName: "solo.mjs", meta: { id: "solo-doctor", description: "Solo doctor", severity: "warning" }, findings: [{ file: "c.ts", line: 1 }] },
];

test("aggregate: doctors sort worst-severity-first and the top doctor opens", async () => {
  const { buildItems, buildListRows, initialExpanded } = await import("../bin/dashboard.js");
  const items = buildItems(aggregateGroups);
  const expanded = initialExpanded(buildTree(items));
  assert.ok(expanded.has("multi-doctor"), "the error-carrying doctor is expanded");
  const rows = buildListRows(buildTree(items), false, 0, new Set(), expanded);
  assert.match(rows[0].text, /multi-doctor ×3/);
  assert.ok(rows[0].text.includes("\u25be"), "top doctor open");
  const soloRow = rows.find(r => r.text.includes("solo-doctor"));
  assert.ok(soloRow && soloRow.text.includes("\u25b8"), "solo doctor collapsed");
});

test("aggregate: enter on a doctor row toggles it and the doctor detail pane renders", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = runDashboardOn({ stdin, stdout }, { ...dashInput(aggregateGroups) }, copyAlways);
  let frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.ok(frame.includes("multi-doctor"), "aggregate frame up");

  stdin.send("\r"); // initial selection is the multi-doctor row: collapse it
  frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.ok(!frame.includes("a.ts:1"), "doctor collapsed");
  assert.ok(frame.includes("3 findings"), "doctor detail pane shows the rollup");

  stdin.send("\r"); // expand again
  frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.ok(frame.includes("a.ts:1"), "doctor re-expanded");

  stdin.send("q");
  assert.equal(await settle(done), "resolved");
});

test("tree: children hang off connectors; guides hold the column under an expanded check", async () => {
  const { buildItems, buildListRows, initialExpanded } = await import("../bin/dashboard.js");
  const items = buildItems(aggregateGroups);
  const expanded = new Set([...initialExpanded(buildTree(items)), "multi-doctor/meh-warn"]);
  const rows = buildListRows(buildTree(items), false, 0, new Set(), expanded);
  const texts = rows.map(r => r.text);
  // children of the doctor: first check connected with ├─, last with └─
  assert.ok(texts.some(t => t.startsWith("  \u251c\u2500 ")), "non-last child connected with \u251c\u2500");
  assert.ok(texts.some(t => t.startsWith("  \u2514\u2500 ")), "last child connected with \u2514\u2500");
  // instances under a NON-last check hang under the \u2502 guide column
  const underFirst = texts.filter(t => t.startsWith("  \u2502"));
  assert.ok(underFirst.length >= 2, "instances of the first check sit under the guide");
  assert.ok(underFirst.every(t => t.includes("a.ts:")), "guide rows are that check's instances");
});

test("tree: back collapses up — instance to check, check to doctor", async () => {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const done = runDashboardOn({ stdin, stdout }, { ...dashInput(aggregateGroups) }, copyAlways);

  // Open the error check (selection starts on the doctor row): down, right.
  stdin.send("j");            // onto check row
  stdin.send("\x1b[C");      // expand it
  stdin.send("j");            // onto its first instance
  let frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.ok(frame.includes("a.ts:1"), "inside the check");

  stdin.send("\x7f");        // backspace: collapse the check, land on it
  frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.ok(!frame.includes("a.ts:1"), "check collapsed");
  assert.ok(/›[▾▸] . Error check/.test(frame), "selection rests on the check row");

  stdin.send("\x1b[D");      // left on the collapsed check: collapse the doctor
  frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.ok(/›▸ . multi-doctor/.test(frame), "doctor collapsed too — back among the doctors");
  assert.ok(frame.includes("3 findings"), "doctor detail pane — back among the doctors");

  stdin.send("q");
  assert.equal(await settle(done), "resolved");
});

test("tree: one multi-check doctor run directly nests like the aggregate", async () => {
  const { buildItems, buildListRows, initialExpanded } = await import("../bin/dashboard.js");
  const items = buildItems(multiGroups); // single-DOCTOR, multi-check frame
  const rows = buildListRows(buildTree(items), false, 1, new Set(), initialExpanded(buildTree(items)));
  const texts = rows.map(r => r.text);
  assert.ok(texts.some(t => t.startsWith("  ├─ ")), "non-last check connects with a branch");
  assert.ok(texts.some(t => t.startsWith("  └─ ")), "last check gets the corner");
  assert.ok(texts.some(t => t.startsWith("  │")), "expanded check instances sit under the guide");
});

// ---- copy at every level (the `c` key) ----

test("checkFixPrompt: overarching explanation with every relevant site", async () => {
  const { buildItems, buildTree, summarizeCheck, checkFixPrompt } = await import("../bin/dashboard.js");
  const items = buildItems(multiGroups);
  const tree = buildTree(items);
  const group = tree[0].checks.find(g => g.checkKey === "multi-doctor/bad-error");
  assert.ok(group, "error check group found");
  const prompt = checkFixPrompt(group.items, "any-doctor run x y");
  assert.match(prompt, /Fix every finding of one any-doctor check/);
  assert.match(prompt, /2 findings across 1 file/);
  assert.ok(prompt.includes("- a.ts:1") && prompt.includes("- a.ts:2"), "every site listed");
  assert.match(prompt, /Why because/);
  assert.match(prompt, /Suggested fix: fix it/);
  assert.match(prompt, /at every listed site/);
  assert.match(prompt, /Verify with `any-doctor run x y`/);
});

test("doctorFixPrompt: per-check sections with sites and fixes", async () => {
  const { buildItems, buildTree, summarizeDoctor, doctorFixPrompt } = await import("../bin/dashboard.js");
  const items = buildItems(multiGroups);
  const tree = buildTree(items);
  const prompt = doctorFixPrompt(summarizeDoctor(tree[0]), tree[0], "any-doctor run x y");
  assert.match(prompt, /Fix the findings of one any-doctor program/);
  assert.match(prompt, /multi-doctor — 3 findings across 2 files/);
  assert.ok(prompt.includes("bad-error") && prompt.includes("meh-warn"), "every check sectioned");
  assert.ok(prompt.includes("- a.ts:2") && prompt.includes("- b.ts:3"), "sites per check");
});

test("runDashboard: `c` copies at the level you are on", async () => {
  const copied = [];
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const deps = { copy: (text) => { copied.push(text); return true; } };
  const done = runDashboardOn({ stdin, stdout }, { ...dashInput(aggregateGroups) }, deps);

  // On a check row: c copies the whole check with all its sites.
  stdin.send("j");              // doctor row -> check row (error check)
  stdin.send("c");
  let frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.match(frame, /copied 2 findings from multi-doctor\/bad-error/);
  assert.match(copied.at(-1), /Fix every finding of one any-doctor check/);
  assert.ok(copied.at(-1).includes("- a.ts:1") && copied.at(-1).includes("- a.ts:2"));

  // On the doctor row: c copies the entire doctor.
  stdin.send("\x7f");          // back: check collapses, selection on it
  stdin.send("\x7f");          // back: doctor collapses, selection on doctor row
  stdin.send("c");
  frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.match(frame, /copied 3 findings from multi-doctor/);
  assert.match(copied.at(-1), /Fix the findings of one any-doctor program/);

  // On an instance row: c copies that finding, same as enter.
  stdin.send("\r");            // expand doctor
  stdin.send("j");              // check row
  stdin.send("\x1b[C");        // expand check
  stdin.send("j");              // instance row
  stdin.send("c");
  frame = stdout.frames.filter(f => f.includes("\x1b[H")).at(-1);
  assert.match(frame, /copied finding/);
  assert.match(copied.at(-1), /Fix exactly one any-doctor finding/);

  stdin.send("q");
  assert.equal(await settle(done), "resolved");
});

test("rows reference their items directly — no index bookkeeping", async () => {
  const { buildItems, buildTree, buildListRows, initialExpanded } = await import("../bin/dashboard.js");
  const items = buildItems(groups);
  const rows = buildListRows(buildTree(items), false, 0, new Set(), initialExpanded(buildTree(items)));
  const itemRows = rows.filter(r => r.kind === "item");
  assert.ok(itemRows.every(r => r.item && items.includes(r.item)), "rows carry the object they were built from");
});

test("more-row on a flat doctor carries its story — the detail pane never blanks", async () => {
  const { buildItems, buildTree, buildListRows, FINDINGS_PER_CHECK } = await import("../bin/dashboard.js");
  const many = Array.from({ length: FINDINGS_PER_CHECK + 10 }, (_, i) => ({ file: "src/big.ts", line: i + 1 }));
  const groups = [
    { programName: "flat.mjs", meta: { id: "flat-doctor", description: "Flat", severity: "warning" }, findings: many },
    { programName: "solo.mjs", meta: { id: "solo-doctor", description: "Solo", severity: "info" }, findings: [{ file: "c.ts", line: 1 }] },
  ];
  const items = buildItems(groups);
  const rows = buildListRows(buildTree(items), false, 0, new Set(), new Set(["flat-doctor"]));
  const more = rows.find(r => r.kind === "more");
  assert.ok(more, "more row present past the cap");
  assert.ok(more.doctor && more.doctor.doctorId === "flat-doctor", "carries the doctor payload");
  assert.equal(more.toggleKey, undefined, "more rows never toggle — inert by kind");
});

// ---- round-2 review gaps: prompt caps and command resolution ----

test("checkFixPrompt caps at 100 sites with the re-run note", async () => {
  const { buildItems, checkFixPrompt } = await import("../bin/dashboard.js");
  const findings = Array.from({ length: 130 }, (_, i) => ({ rule: "bad-error", file: "src/a" + (i % 7) + ".ts", line: i + 1 }));
  const items = buildItems([{ ...multiGroups[0], findings }]);
  const prompt = checkFixPrompt(items, "any-doctor run x y");
  const siteCount = (prompt.match(/^- src\//gm) || []).length;
  assert.equal(siteCount, 100, "exactly the cap listed");
  assert.match(prompt, /… and 30 more — fix this batch, then re-run for the rest/);
  assert.match(prompt, /any of these checks|the check/, "suppress guidance present");
});

test("doctorFixPrompt says any-of-these-checks for multi-check tasks", async () => {
  const { buildItems, buildTree, summarizeDoctor, doctorFixPrompt } = await import("../bin/dashboard.js");
  const items = buildItems(multiGroups);
  const tree = buildTree(items);
  const prompt = doctorFixPrompt(summarizeDoctor(tree[0]), tree[0], "any-doctor run x y");
  assert.match(prompt, /do not suppress, disable, or silence any of these checks/);
  assert.match(prompt, /confirm the findings are gone/);
});

test("runDashboard: copied prompts resolve the re-run command per doctor", async () => {
  const copied = [];
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const deps = { copy: (text) => { copied.push(text); return true; } };
  const input = {
    ...dashInput(),
    outcome: {
      ...dashInput().outcome,
      doctorPaths: new Map([["stripe-doctor", "doctors/stripe.mjs"]]),
    },
  };
  const done = runDashboardOn({ stdin, stdout }, input, deps);
  // selection starts on the doctor row; expand and copy the check group
  stdin.send("j");              // onto the check row
  stdin.send("c");
  stdin.send("q");
  assert.equal(await settle(done), "resolved");
  const prompt = copied.at(-1);
  assert.ok(prompt, "check group copied");
  assert.match(prompt, /Verify with `any-doctor run \"doctors\/stripe\.mjs\" \"\.\"`/,
    "the outcome's doctorPaths resolved the doctor that owns the check");
});
