import { test } from "node:test";
import assert from "node:assert/strict";

const { compareFindings, decodeSearchOp, RESULT_SENTINEL, PROTOCOL_VERSION, resolveFinding, modeArgs, decodeLoaderArgs } = (await import("../bin/contract.js"));

test("Mode round-trip: encoded once, decoded once, identical on both sides", () => {
  const program = "/repo/doctors/x.mjs";
  const cases = [
    { kind: "run", root: "/repo" },
    { kind: "verify", fixtures: "/repo/doctors/x.fixtures.mjs" },
    { kind: "meta" },
  ];
  for (const mode of cases) {
    assert.deepEqual(decodeLoaderArgs(modeArgs(mode, program)), { program, mode });
  }
});

test("decodeLoaderArgs: rejects argv that is no mode at all", () => {
  assert.equal(decodeLoaderArgs([]), null);
  assert.equal(decodeLoaderArgs(["--verify"]), null, "a flag where the program belongs");
  assert.equal(decodeLoaderArgs(["p.mjs"]), null, "run mode needs a root");
  assert.equal(decodeLoaderArgs(["p.mjs", "--meta", "extra"]), null);
  assert.equal(decodeLoaderArgs(["p.mjs", "--verify"]), null, "verify needs fixtures");
});

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

test("compareFindings: the rule is part of the match (D20 — the gate is rule-aware)", () => {
  const diff = compareFindings(
    [{ rule: "check-a", file: "a.ts", line: 2 }],
    [{ rule: "check-b", file: "a.ts", line: 2 }]
  );
  assert.deepEqual(diff, {
    missing: [{ rule: "check-a", file: "a.ts", line: 2 }],
    unexpected: [{ rule: "check-b", file: "a.ts", line: 2 }],
  });
});

test("compareFindings: rule-less expected matches only rule-less findings", () => {
  const diff = compareFindings(
    [{ file: "a.ts", line: 2 }],
    [{ rule: "check-a", file: "a.ts", line: 2 }]
  );
  assert.deepEqual(diff, {
    missing: [{ file: "a.ts", line: 2 }],
    unexpected: [{ rule: "check-a", file: "a.ts", line: 2 }],
  });
});

test("compareFindings: same rule+location twice against one expected leaves one unexpected (multiset)", () => {
  const diff = compareFindings(
    [{ rule: "check-a", file: "a.ts", line: 2 }],
    [
      { rule: "check-a", file: "a.ts", line: 2 },
      { rule: "check-a", file: "a.ts", line: 2 },
    ]
  );
  assert.deepEqual(diff, { missing: [], unexpected: [{ rule: "check-a", file: "a.ts", line: 2 }] });
});

test("compareFindings: a doubled expectation needs two findings (multiset)", () => {
  const diff = compareFindings(
    [
      { rule: "check-a", file: "a.ts", line: 2 },
      { rule: "check-a", file: "a.ts", line: 2 },
    ],
    [{ rule: "check-a", file: "a.ts", line: 2 }]
  );
  assert.deepEqual(diff, { missing: [{ rule: "check-a", file: "a.ts", line: 2 }], unexpected: [] });
});

test("decodeSearchOp: known ops decode, unknown ops are loud with the known list", () => {
  assert.deepEqual(decodeSearchOp("pattern"), { op: "pattern" });
  assert.deepEqual(decodeSearchOp("rule"), { op: "rule" });
  assert.deepEqual(decodeSearchOp("rules"), { op: "rules" });
  assert.deepEqual(decodeSearchOp("analysis"), { op: "analysis" });
  assert.match(decodeSearchOp("analysiss").error, /unknown search-channel op "analysiss"/);
  assert.match(decodeSearchOp(undefined).error, /known ops: pattern, rule, rules, analysis/);
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

test("fixturesPathFor: one home for the fixtures-naming convention", async () => {
  const { fixturesPathFor } = await import("../bin/contract.js");
  assert.equal(fixturesPathFor("/x/doctors/d.mjs"), "/x/doctors/d.fixtures.mjs");
  assert.equal(fixturesPathFor("d.cjs"), "d.fixtures.mjs");
  assert.equal(fixturesPathFor("d.js"), "d.fixtures.mjs");
});

test("runCommandFor: default and invocation-aware re-run command", async () => {
  const { runCommandFor } = await import("../bin/contract.js");
  assert.equal(runCommandFor("doctors/d.mjs", "src"), 'any-doctor run "doctors/d.mjs" "src"');
  assert.equal(runCommandFor("doctors/d.mjs", "src", 'node "/abs/cli.js"'), 'node "/abs/cli.js" run "doctors/d.mjs" "src"');
});
