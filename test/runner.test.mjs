import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctor, verifyDoctor, metaDoctor, describeRunnerError } from "../bin/runner.js";

// The interface is the test surface: every test crosses the Runner seam with
// real child processes, real repo doctors, and the real sample app. The
// public interface is plain async that throws typed failures — no Effect
// vocabulary here.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCTOR = path.join(REPO, "doctors", "async-doctor.mjs");
const TARGET = path.join(REPO, "fixtures", "sample-app");

function tmpDoctor(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-runner-"));
  const file = path.join(dir, "doctor.mjs");
  fs.writeFileSync(file, lines.join("\n"));
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("runDoctor: executes the doctor against the sample app", async () => {
  const r = await runDoctor({ programPath: DOCTOR, targetDir: TARGET });
  assert.equal(r.meta.id, "async-doctor");
  assert.equal(r.findings.length, 4);
  assert.ok(r.durationMs >= 0);
});

test("runDoctor: missing program throws ProgramMissing, not a silent zero", async () => {
  await assert.rejects(
    runDoctor({ programPath: "/nope/missing.mjs", targetDir: TARGET }),
    (e) => e._tag === "ProgramMissing" && e.programPath === "/nope/missing.mjs",
  );
});

test("runDoctor: crashing doctor throws DoctorCrashed with the stderr tail", async () => {
  const t = tmpDoctor([
    "export const meta = { id: 'crasher', description: 'x', severity: 'info' }",
    "export async function doctor(ctx) { throw new Error('kaboom') }",
  ]);
  try {
    await assert.rejects(
      runDoctor({ programPath: t.file, targetDir: TARGET }),
      (e) => e._tag === "DoctorCrashed" && /kaboom/.test(e.detail),
    );
  } finally {
    t.cleanup();
  }
});

test("verifyDoctor: fixture gate green on the repo doctor", async () => {
  const r = await verifyDoctor({ programPath: DOCTOR });
  assert.ok(r.results.length > 0);
  assert.ok(r.results.every(x => x.ok));
});

test("verifyDoctor: fixture gate green on the repo convex doctor", async () => {
  const r = await verifyDoctor({ programPath: path.join(REPO, "doctors", "convex-doctor.mjs") });
  assert.ok(r.results.length >= 42);
  assert.ok(r.results.every(x => x.ok));
});

test("verifyDoctor: fixture gate green on the repo openrouter doctor", async () => {
  const r = await verifyDoctor({ programPath: path.join(REPO, "doctors", "openrouter-doctor.mjs") });
  assert.ok(r.results.length >= 11);
  assert.ok(r.results.every(x => x.ok));
});

test("verifyDoctor: fixture gate green on the repo effect-v4 doctor", async () => {
  const r = await verifyDoctor({ programPath: path.join(REPO, "doctors", "effect-v4-doctor.mjs") });
  assert.ok(r.results.length >= 29);
  assert.ok(r.results.every(x => x.ok));
});

test("verifyDoctor: missing fixtures throws FixturesMissing carrying the expected path", async () => {
  const t = tmpDoctor([
    "export const meta = { id: 'bare', description: 'x', severity: 'info' }",
    "export async function doctor(ctx) {}",
  ]);
  try {
    await assert.rejects(
      verifyDoctor({ programPath: t.file }),
      (e) => e._tag === "FixturesMissing" && e.fixturesPath === t.file.replace(/\.mjs$/, ".fixtures.mjs"),
    );
  } finally {
    t.cleanup();
  }
});

test("metaDoctor: reads meta; a broken doctor is data, not a throw", async () => {
  const good = await metaDoctor({ programPath: DOCTOR });
  assert.equal(good.meta.id, "async-doctor");
  assert.equal(good.cause, undefined);

  const t = tmpDoctor(["export async function doctor(ctx) {}"]);
  try {
    const bad = await metaDoctor({ programPath: t.file });
    assert.equal(bad.meta, null);
    assert.equal(bad.cause?._tag, "DoctorCrashed");
    assert.match(describeRunnerError(bad.cause), /invalid doctor meta/i);
  } finally {
    t.cleanup();
  }
});

test("runDoctorCohort: bounded pool, input order preserved, a crash is typed data", async () => {
  const { runDoctorCohort } = await import("../bin/runner.js");
  const crasher = tmpDoctor([
    "export const meta = { id: 'cohort-crasher', description: 'x', severity: 'info' }",
    "export async function doctor(ctx) { throw new Error('kaboom-cohort') }",
  ]);
  try {
    const runs = await runDoctorCohort([
      { programPath: DOCTOR, targetDir: TARGET },
      { programPath: crasher.file, targetDir: TARGET },
      { programPath: DOCTOR, targetDir: TARGET },
    ]);
    assert.equal(runs.length, 3, "one run per option, in input order");
    assert.ok(runs[0].ok && runs[0].result.meta.id === "async-doctor");
    assert.ok(!runs[1].ok && runs[1].cause._tag === "DoctorCrashed", "the crash arrives as typed data");
    assert.ok(runs[2].ok, "a sibling's crash never interrupts the cohort");
    assert.equal(runs[2].result.meta.id, "async-doctor");
  } finally {
    crasher.cleanup();
  }
});
