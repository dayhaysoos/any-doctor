import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { buildItems, buildListRows, issuePrompt, scoreBar } = require("../bin/dashboard.js");

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
  assert.equal(items[0].site.file, "src/a.ts");
  assert.equal(items[0].site.line, 2);
  assert.equal(items[0].checkKey, "stripe-doctor/charges-create");
  assert.equal(items[0].description, "Direct legacy charge creation");
  assert.equal(items[0].impact, "money moves wrong");
  assert.equal(items[2].doctorId, "other");
});

test("buildListRows: section rows per doctor, item rows per instance", () => {
  const items = buildItems(groups, "doctors/stripe-doctor.mjs");
  const rows = buildListRows(items, false, 0, new Set());
  assert.equal(rows.filter(r => r.kind === "section").length, 2);
  assert.equal(rows.filter(r => r.kind === "item").length, 3);
  assert.equal(rows[0].kind, "section");
  assert.equal(rows[0].text, "stripe-doctor");
  assert.equal(rows[3].text, "other");
});

test("issuePrompt: per-instance scope with single affected site", () => {
  const items = buildItems(groups, "doctors/stripe-doctor.mjs");
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
