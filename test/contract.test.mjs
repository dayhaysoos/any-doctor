import { test } from "node:test";
import assert from "node:assert/strict";

const { compareFindings, RESULT_SENTINEL, PROTOCOL_VERSION, resolveFinding } = (await import("../bin/contract.js"));

const META = {
  id: "stripe-doctor",
  description: "Deprecated Stripe usage",
  severity: "warning",
  category: "bugs",
  blindSpots: ["aliased clients"],
  checks: [
    { id: "charges-create", description: "Direct legacy charge creation", severity: "error", impact: "money moves wrong", why: "charges.create is legacy", fix: "use paymentIntents" },
    { id: "no-severity-check", description: "Check without its own severity" },
  ],
};

test("compareFindings: exact set passes when actual equals expected", () => {
  const diff = compareFindings(
    [{ file: "a.ts", line: 2 }],
    [{ file: "a.ts", line: 2 }]
  );
  assert.deepEqual(diff, { missing: [], unexpected: [] });
});

test("compareFindings: a missing expected finding is reported", () => {
  const diff = compareFindings(
    [{ file: "a.ts", line: 2 }],
    []
  );
  assert.deepEqual(diff, { missing: [{ file: "a.ts", line: 2 }], unexpected: [] });
});

test("compareFindings: an unexpected finding is reported (precision gate)", () => {
  const diff = compareFindings(
    [],
    [{ file: "b.ts", line: 7 }]
  );
  assert.deepEqual(diff, { missing: [], unexpected: [{ file: "b.ts", line: 7 }] });
});

test("compareFindings: message and severity differences do not matter", () => {
  const diff = compareFindings(
    [{ file: "a.ts", line: 2 }],
    [{ file: "a.ts", line: 2, message: "anything", severity: "error" }]
  );
  assert.deepEqual(diff, { missing: [], unexpected: [] });
});

test("protocol constants exist and are versioned", () => {
  assert.equal(typeof RESULT_SENTINEL, "string");
  assert.ok(RESULT_SENTINEL.length > 0);
  assert.equal(PROTOCOL_VERSION, 1);
});

test("resolveFinding: per-finding severity override wins over check and doctor", () => {
  const j = resolveFinding(META, { rule: "charges-create", file: "a.ts", line: 1, severity: "info" });
  assert.equal(j.severity, "info");
  assert.equal(j.declaredSeverity, "error");
});

test("resolveFinding: ladder falls back check severity, then doctor default", () => {
  assert.equal(resolveFinding(META, { rule: "charges-create", file: "a.ts", line: 1 }).severity, "error");
  assert.equal(resolveFinding(META, { rule: "no-severity-check", file: "a.ts", line: 1 }).severity, "warning");
  assert.equal(resolveFinding(META, { file: "a.ts", line: 1 }).severity, "warning");
});

test("resolveFinding: joins check fields, keys, category, and blind spots", () => {
  const j = resolveFinding(META, { rule: "charges-create", file: "a.ts", line: 1 });
  assert.equal(j.checkKey, "stripe-doctor/charges-create");
  assert.equal(j.doctorId, "stripe-doctor");
  assert.equal(j.description, "Direct legacy charge creation");
  assert.equal(j.category, "bugs");
  assert.equal(j.impact, "money moves wrong");
  assert.deepEqual(j.blindSpots, ["aliased clients"]);
  assert.deepEqual(j.finding, { rule: "charges-create", file: "a.ts", line: 1 });
});

test("resolveFinding: unpartitioned doctor keys to itself and defaults to doctor meta", () => {
  const j = resolveFinding({ id: "other", description: "Other checks", severity: "info" }, { file: "b.ts", line: 7 });
  assert.equal(j.checkKey, "other/other");
  assert.equal(j.checkId, "other");
  assert.equal(j.description, "Other checks");
  assert.equal(j.severity, "info");
  assert.equal(j.category, "general");
});
