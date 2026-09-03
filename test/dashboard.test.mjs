import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { buildItems, buildSections, issuePrompt, scoreBar } = require("../bin/dashboard.js");

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
  const items = buildItems(groups, "doctors/stripe-doctor.mjs");
  assert.equal(items.length, 3);
  assert.equal(items[0].key, "stripe-doctor/charges-create@src/a.ts:2");
  assert.equal(items[1].key, "stripe-doctor/charges-create@src/a.ts:9");
  assert.equal(items[0].sites.length, 1);
  assert.equal(items[0].description, "Direct legacy charge creation");
  assert.equal(items[0].impact, "money moves wrong");
});

test("buildSections: one section per doctor, indexes into items", () => {
  const items = buildItems(groups, "doctors/stripe-doctor.mjs");
  const sections = buildSections(items);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].title, "stripe-doctor");
  assert.equal(sections[0].itemIndexes.length, 2);
  assert.equal(sections[1].title, "other");
});

test("issuePrompt: per-instance scope with single affected site", () => {
  const items = buildItems(groups, "doctors/stripe-doctor.mjs");
  const prompt = issuePrompt(items[0], "any-doctor verify doctors/stripe-doctor.mjs");
  assert.match(prompt, /Fix exactly one any-doctor check/);
  assert.match(prompt, /ERROR · Direct legacy charge creation \(stripe-doctor\/charges-create, ×1\)/);
  assert.match(prompt, /- src\/a\.ts:2/);
  assert.doesNotMatch(prompt, /src\/a\.ts:9/);
  assert.match(prompt, /Impact money moves wrong/);
  assert.match(prompt, /Suggested fix: use paymentIntents/);
  assert.match(prompt, /Fix only stripe-doctor\/charges-create/);
});

test("scoreBar: fills proportionally", () => {
  assert.equal(scoreBar(100, 10), "██████████");
  assert.equal(scoreBar(0, 10), "░░░░░░░░░░");
  assert.equal(scoreBar(50, 10), "█████░░░░░");
});
