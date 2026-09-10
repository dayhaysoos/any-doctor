import { test } from "node:test";
import assert from "node:assert/strict";

// The Doctor tree's view-model tests (moved from dashboard.test.mjs —
// bodies unchanged, import sources updated).

const { buildItems } = await import("../bin/doctor-tree.js");

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

test("tree: each doctor carries its own score against the same denominator", async () => {
  const { buildItems, buildTree } = await import("../bin/doctor-tree.js");
  const twoDoctors = [
    { programName: "a.mjs", meta: { id: "a", description: "x", severity: "warning" }, findings: [{ file: "f1.ts", line: 1 }, { file: "f2.ts", line: 1 }] },
    { programName: "b.mjs", meta: { id: "b", description: "x", severity: "warning" }, findings: [{ file: "f1.ts", line: 9 }] },
  ];
  const gc = gcOf(twoDoctors);
  const tree = buildTree(gc, 10);
  const a = tree.find(d => d.doctorId === "a");
  const b = tree.find(d => d.doctorId === "b");
  assert.equal(a.score.score, 90, "two warning files: burden 1.0/10");
  assert.equal(b.score.score, 95, "one warning file: burden 0.5/10");
});
