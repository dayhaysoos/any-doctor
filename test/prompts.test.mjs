import { test } from "node:test";
import assert from "node:assert/strict";

// Task prompts test without a terminal: pure functions of the Doctor tree's
// view-model types plus the verify command (moved from dashboard.test.mjs —
// bodies unchanged, import sources updated).

const { buildItems, buildTree, summarizeCheck, summarizeDoctor } = await import("../bin/doctor-tree.js");
const { fixPrompt, checkFixPrompt, doctorFixPrompt } = await import("../bin/prompts.js");

const { deriveSummary } = await import("../bin/summary.js");
// The tree consumes the Summary's check buckets; tests build them the way
// production does — through the one derivation.
const gcOf = (groups) => deriveSummary({ groups, crashed: [], skippedUnsafe: [], doctorPaths: new Map(), fileCount: 0, durationMs: 0, targetDir: "." }).groupChecks;

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

test("checkFixPrompt: overarching explanation with every relevant site", async () => {
  const { buildItems, buildTree, summarizeCheck } = await import("../bin/doctor-tree.js");
  const { checkFixPrompt } = await import("../bin/prompts.js");
  const items = buildItems(multiGroups);
  const gc = gcOf(multiGroups);
  const tree = buildTree(gc, 10);
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
  const { buildItems, buildTree, summarizeDoctor } = await import("../bin/doctor-tree.js");
  const { doctorFixPrompt } = await import("../bin/prompts.js");
  const gc = gcOf(multiGroups);
  const tree = buildTree(gc, 10);
  const prompt = doctorFixPrompt(summarizeDoctor(tree[0]), tree[0], "any-doctor run x y");
  assert.match(prompt, /Fix the findings of one any-doctor program/);
  assert.match(prompt, /multi-doctor — 3 findings across 2 files/);
  assert.ok(prompt.includes("bad-error") && prompt.includes("meh-warn"), "every check sectioned");
  assert.ok(prompt.includes("- a.ts:2") && prompt.includes("- b.ts:3"), "sites per check");
});

test("checkFixPrompt caps at 100 sites with the re-run note", async () => {
  const { buildItems } = await import("../bin/doctor-tree.js");
  const { checkFixPrompt } = await import("../bin/prompts.js");
  const findings = Array.from({ length: 130 }, (_, i) => ({ rule: "bad-error", file: "src/a" + (i % 7) + ".ts", line: i + 1 }));
  const items = buildItems([{ ...multiGroups[0], findings }]);
  const prompt = checkFixPrompt(items, "any-doctor run x y");
  const siteCount = (prompt.match(/^- src\//gm) || []).length;
  assert.equal(siteCount, 100, "exactly the cap listed");
  assert.match(prompt, /… and 30 more — fix this batch, then re-run for the rest/);
  assert.match(prompt, /any of these checks|the check/, "suppress guidance present");
});

test("doctorFixPrompt says any-of-these-checks for multi-check tasks", async () => {
  const { buildItems, buildTree, summarizeDoctor } = await import("../bin/doctor-tree.js");
  const { doctorFixPrompt } = await import("../bin/prompts.js");
  const gc = gcOf(multiGroups);
  const tree = buildTree(gc, 10);
  const prompt = doctorFixPrompt(summarizeDoctor(tree[0]), tree[0], "any-doctor run x y");
  assert.match(prompt, /do not suppress, disable, or silence any of these checks/);
  assert.match(prompt, /confirm the findings are gone/);
});
