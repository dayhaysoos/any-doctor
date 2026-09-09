import { test } from "node:test";
import assert from "node:assert/strict";

// The Gate's interface is the test surface: a severity bar ("at or
// above"), advisory-by-default findings, added-only counting in diff
// mode. Crash/skip behavior lives in the CLI's exit law and is pinned
// there — gateVerdict only ever judges findings.

const { gateVerdict, countsOfSeverities, isFailOn } = await import("../bin/gate.js");

test("gate: --fail-on none is advisory — findings never fail", () => {
  const v = gateVerdict("none", { error: 3, warning: 5, info: 7 }, "full");
  assert.equal(v.fails, false);
  assert.equal(v.reason, null);
});

test("gate: the bar is at-or-above", () => {
  assert.equal(gateVerdict("error", { error: 0, warning: 4, info: 0 }, "full").fails, false, "warnings do not clear the error bar");
  assert.equal(gateVerdict("error", { error: 1, warning: 0, info: 0 }, "full").fails, true, "one error fails the error bar");
  assert.equal(gateVerdict("warning", { error: 0, warning: 1, info: 9 }, "full").fails, true, "warnings clear the warning bar; infos do not shield them");
  assert.equal(gateVerdict("warning", { error: 0, warning: 0, info: 9 }, "full").fails, false, "infos alone do not clear the warning bar");
  assert.equal(gateVerdict("info", { error: 0, warning: 0, info: 1 }, "full").fails, true, "info is the any-finding bar");
});

test("gate: the reason names the count, the bar, and the mode's noun", () => {
  const one = gateVerdict("error", { error: 1, warning: 0, info: 0 }, "full");
  assert.match(one.reason, /1 finding at or above error/);
  const many = gateVerdict("warning", { error: 2, warning: 3, info: 0 }, "diff");
  assert.match(many.reason, /5 new findings at or above warning/, "diff mode counts added severities together");
});

test("gate: countsOfSeverities tallies a severity list", () => {
  assert.deepEqual(
    countsOfSeverities(["warning", "error", "warning", "info", "warning"]),
    { error: 1, warning: 3, info: 1 },
  );
});

test("gate: isFailOn admits exactly the four bars", () => {
  for (const ok of ["none", "error", "warning", "info"]) assert.equal(isFailOn(ok), true);
  for (const bad of ["none", "warn", "errors", ""]) assert.equal(isFailOn(bad), bad === "none");
});
