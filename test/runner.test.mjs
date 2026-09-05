import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Cause, Effect, Exit } from "effect";
import { runDoctor, verifyDoctor, countIssues, metaDoctor } from "../bin/runner.js";

// The interface is the test surface: every test crosses the Runner seam with
// real child processes, real repo doctors, and the real sample app.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCTOR = path.join(REPO, "doctors", "fetch-calls-without-abortsignal.mjs");
const TARGET = path.join(REPO, "fixtures", "sample-app");

async function unwrap(effect) {
  const exit = await Effect.runPromiseExit(effect);
  return Exit.match(exit, {
    onFailure: (cause) => ({ ok: false, error: Cause.squash(cause) }),
    onSuccess: (value) => ({ ok: true, value }),
  });
}

function tmpDoctor(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-runner-"));
  const file = path.join(dir, "doctor.mjs");
  fs.writeFileSync(file, lines.join("\n"));
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("runDoctor: executes the doctor against the sample app", async () => {
  const r = await unwrap(runDoctor({ programPath: DOCTOR, targetDir: TARGET }));
  assert.ok(r.ok);
  assert.equal(r.value.meta.id, "fetch-calls-without-abortsignal");
  assert.equal(r.value.findings.length, 3);
  assert.ok(r.value.durationMs >= 0);
});

test("countIssues: projects findings length", async () => {
  const r = await unwrap(countIssues({ programPath: DOCTOR, targetDir: TARGET }));
  assert.deepEqual(r, { ok: true, value: 3 });
});

test("runDoctor: missing program is ProgramMissing, not a silent zero", async () => {
  const r = await unwrap(runDoctor({ programPath: "/nope/missing.mjs", targetDir: TARGET }));
  assert.ok(!r.ok);
  assert.equal(r.error._tag, "ProgramMissing");
  assert.equal(r.error.programPath, "/nope/missing.mjs");
});

test("runDoctor: crashing doctor is DoctorCrashed with the stderr tail", async () => {
  const t = tmpDoctor([
    "export const meta = { id: 'crasher', description: 'x', severity: 'info' }",
    "export async function doctor(ctx) { throw new Error('kaboom') }",
  ]);
  try {
    const r = await unwrap(runDoctor({ programPath: t.file, targetDir: TARGET }));
    assert.ok(!r.ok);
    assert.equal(r.error._tag, "DoctorCrashed");
    assert.match(r.error.detail, /kaboom/);
  } finally {
    t.cleanup();
  }
});

test("verifyDoctor: fixture gate green on the repo doctor", async () => {
  const r = await unwrap(verifyDoctor({ programPath: DOCTOR }));
  assert.ok(r.ok);
  assert.ok(r.value.results.length > 0);
  assert.ok(r.value.results.every(x => x.ok));
});

test("verifyDoctor: missing fixtures is FixturesMissing carrying the expected path", async () => {
  const t = tmpDoctor([
    "export const meta = { id: 'bare', description: 'x', severity: 'info' }",
    "export async function doctor(ctx) {}",
  ]);
  try {
    const r = await unwrap(verifyDoctor({ programPath: t.file }));
    assert.ok(!r.ok);
    assert.equal(r.error._tag, "FixturesMissing");
    assert.equal(r.error.fixturesPath, t.file.replace(/\.mjs$/, ".fixtures.mjs"));
  } finally {
    t.cleanup();
  }
});

test("metaDoctor: reads meta; a broken doctor is data, not a failure", async () => {
  const good = await Effect.runPromise(metaDoctor({ programPath: DOCTOR }));
  assert.equal(good.meta.id, "fetch-calls-without-abortsignal");
  assert.equal(good.error, undefined);

  const t = tmpDoctor(["export async function doctor(ctx) {}"]);
  try {
    const bad = await Effect.runPromise(metaDoctor({ programPath: t.file }));
    assert.equal(bad.meta, null);
    assert.match(bad.error, /meta/i);
  } finally {
    t.cleanup();
  }
});
