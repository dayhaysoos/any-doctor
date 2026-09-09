import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// The Cohort's interface is the test surface: chosen doctor programs
// plus a target cross the seam as real child processes against the real
// sample app — the same posture as runner.test.mjs, one layer up. The
// fold (crashes as data, the analysis fold, path pairing, file-count
// policy, timing) is what these tests pin; the runner's own tests pin
// the pool beneath.

const { runCohort } = await import("../bin/cohort.js");

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCTOR = path.join(REPO, "doctors", "async-doctor.mjs");
const TARGET = path.join(REPO, "fixtures", "sample-app");

test("runCohort: a single doctor is a cohort of one — the full RunOutcome", async () => {
  const outcome = await runCohort({
    doctors: [{ id: "async-doctor", programPath: DOCTOR }],
    targetDir: TARGET,
    includeTests: false,
  });
  assert.equal(outcome.groups.length, 1);
  assert.equal(outcome.groups[0].meta.id, "async-doctor");
  assert.deepEqual(outcome.crashed, []);
  assert.ok(outcome.fileCount > 0, "the sample app has files");
  assert.equal(outcome.doctorPaths.get("async-doctor"), DOCTOR);
  assert.equal(outcome.targetDir, TARGET);
  assert.ok(outcome.durationMs >= 0);
  assert.equal(typeof outcome.analysisAvailable, "boolean");
});

test("runCohort: a crash is data — id plus full detail, siblings still report", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-cohort-"));
  try {
    const boom = path.join(dir, "boom.mjs");
    fs.writeFileSync(boom, [
      "export const meta = { id: 'boom', description: 'x', severity: 'info' }",
      "export async function doctor(ctx) { throw new Error('kaboom') }",
    ].join("\n"));
    const outcome = await runCohort({
      doctors: [
        { id: "boom", programPath: boom },
        { id: "async-doctor", programPath: DOCTOR },
      ],
      targetDir: TARGET,
      includeTests: false,
    });
    assert.equal(outcome.groups.length, 1, "the healthy doctor still reports");
    assert.equal(outcome.crashed.length, 1);
    assert.equal(outcome.crashed[0].id, "boom", "the crash is named by the spec id");
    assert.match(outcome.crashed[0].detail, /kaboom/, "the full error detail rides the outcome");
    assert.ok(!outcome.doctorPaths.has("boom"), "no path pairing for a dead doctor");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runCohort: analysis is a process-wide fold across the batch", async () => {
  const outcome = await runCohort({
    doctors: [
      { id: "async-doctor", programPath: DOCTOR },
      { id: "openrouter-doctor", programPath: path.join(REPO, "doctors", "openrouter-doctor.mjs") },
    ],
    targetDir: TARGET,
    includeTests: false,
  });
  assert.equal(outcome.groups.length, 2);
  assert.equal(outcome.analysisAvailable, true, "the engine present in this repo powers every run");
});

test("runCohort: progress events pass through untouched", async () => {
  const events = [];
  const outcome = await runCohort(
    { doctors: [{ id: "async-doctor", programPath: DOCTOR }], targetDir: TARGET, includeTests: false },
    (p) => events.push(p),
  );
  assert.equal(outcome.groups.length, 1);
  assert.equal(events.length, 1, "one settle event for one doctor");
  assert.equal(events[0].ok, true);
  assert.equal(events[0].total, 1);
});

test("runCohort: an empty cohort is an honest empty outcome, not a throw", async () => {
  const outcome = await runCohort({ doctors: [], targetDir: TARGET, includeTests: false });
  assert.deepEqual(outcome.groups, []);
  assert.deepEqual(outcome.crashed, []);
  assert.equal(outcome.fileCount, 0);
  assert.equal(outcome.analysisAvailable, false);
});
