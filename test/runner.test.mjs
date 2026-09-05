import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctor, verifyDoctor, metaDoctor, countAll } from "../bin/runner.js";

// The interface is the test surface: every test crosses the Runner seam with
// real child processes, real repo doctors, and the real sample app. The
// public interface is plain async that throws typed failures — no Effect
// vocabulary here.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCTOR = path.join(REPO, "doctors", "fetch-calls-without-abortsignal.mjs");
const TARGET = path.join(REPO, "fixtures", "sample-app");

function tmpDoctor(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-runner-"));
  const file = path.join(dir, "doctor.mjs");
  fs.writeFileSync(file, lines.join("\n"));
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("runDoctor: executes the doctor against the sample app", async () => {
  const r = await runDoctor({ programPath: DOCTOR, targetDir: TARGET });
  assert.equal(r.meta.id, "fetch-calls-without-abortsignal");
  assert.equal(r.findings.length, 3);
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
  assert.equal(good.meta.id, "fetch-calls-without-abortsignal");
  assert.equal(good.error, undefined);

  const t = tmpDoctor(["export async function doctor(ctx) {}"]);
  try {
    const bad = await metaDoctor({ programPath: t.file });
    assert.equal(bad.meta, null);
    assert.match(bad.error, /meta/i);
  } finally {
    t.cleanup();
  }
});

test("countAll: parallel counts preserve order; a crash is data, not an abort", async () => {
  const t = tmpDoctor([
    "export const meta = { id: 'crasher', description: 'x', severity: 'info' }",
    "export async function doctor(ctx) { throw new Error('kaboom') }",
  ]);
  try {
    const results = await countAll({ programPaths: [DOCTOR, "/nope/missing.mjs", t.file], targetDir: TARGET });
    assert.equal(results.length, 3);
    assert.deepEqual(results[0], { programPath: DOCTOR, count: 3 });
    assert.equal(results[1].error._tag, "ProgramMissing");
    assert.equal(results[2].error._tag, "DoctorCrashed");
  } finally {
    t.cleanup();
  }
});
