import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

const { discoverDoctors } = (await import("../bin/discover.js"));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pilotSource = fs.readFileSync(path.join(repoRoot, "doctors", "async-doctor.mjs"), "utf8");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-discover-"));
}

test("discoverDoctors: finds repo-scope doctor with real meta", async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "doctors"));
  fs.writeFileSync(path.join(root, "doctors", "async-doctor.mjs"), pilotSource);
  const found = await discoverDoctors(root, { globalDir: path.join(root, "no-global") });
  assert.equal(found.length, 1);
  assert.equal(found[0].slug, "async-doctor");
  assert.equal(found[0].scope, "repo");
  assert.equal(found[0].meta.id, "async-doctor");
  assert.ok(Array.isArray(found[0].meta.blindSpots));
  fs.rmSync(root, { recursive: true, force: true });
});

test("discoverDoctors: global scope found, repo wins slug collisions", async () => {
  const root = tmp();
  const globalDir = path.join(root, "global");
  fs.mkdirSync(path.join(root, "doctors"), { recursive: true });
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(path.join(root, "doctors", "async-doctor.mjs"), pilotSource);
  fs.writeFileSync(path.join(globalDir, "other.mjs"), [
    "export const meta = { id: 'other', description: 'other', severity: 'info' }",
    "export async function doctor(ctx) {}",
  ].join("\n"));
  fs.writeFileSync(path.join(globalDir, "async-doctor.mjs"), pilotSource);

  const found = await discoverDoctors(root, { globalDir });
  assert.equal(found.length, 2);
  const pilot = found.find(d => d.slug === "async-doctor");
  assert.equal(pilot.scope, "repo");
  assert.equal(found.find(d => d.slug === "other").scope, "global");
  fs.rmSync(root, { recursive: true, force: true });
});

test("discoverDoctors: broken doctor surfaces with its typed cause, fixture files ignored", async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "doctors"));
  fs.writeFileSync(path.join(root, "doctors", "broken.mjs"), "export async function doctor(ctx) {}");
  fs.writeFileSync(path.join(root, "doctors", "unawaited-async-map.fixtures.mjs"), "export const fixtures = []");
  const found = await discoverDoctors(root, { globalDir: path.join(root, "no-global") });
  assert.equal(found.length, 1);
  assert.equal(found[0].slug, "broken");
  assert.equal(found[0].meta, null);
  assert.equal(found[0].cause?._tag, "DoctorCrashed", "the typed cause crosses intact");
  fs.rmSync(root, { recursive: true, force: true });
});

test("resolveDoctorPath: globalDir is injectable — the scope functions match", async () => {
  const { resolveDoctorPath } = await import("../bin/discover.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-resolve-"));
  const globalDir = path.join(root, "global");
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(path.join(globalDir, "only-global.mjs"), [
    "export const meta = { id: 'only-global', description: 'x', severity: 'info' }",
    "export async function doctor(ctx) {}",
  ].join("\n"));
  const nested = path.join(root, "nested", "deep");
  fs.mkdirSync(nested, { recursive: true });
  assert.equal(resolveDoctorPath("only-global.mjs", nested, { globalDir }), path.join(globalDir, "only-global.mjs"));
  assert.equal(resolveDoctorPath("only-global.mjs", nested), null, "default global scope does not contain it");
  fs.rmSync(root, { recursive: true, force: true });
});

test("resolveDoctorPath: a bare slug resolves scopes-first; cwd cannot shadow", async () => {
  const { resolveDoctorPath } = await import("../bin/discover.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-precedence-"));
  const globalDir = path.join(root, "global");
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(path.join(globalDir, "dual.mjs"), "export const meta = {}");
  fs.writeFileSync(path.join(root, "dual.mjs"), "export const meta = {}"); // the stray shadow in cwd
  assert.equal(
    resolveDoctorPath("dual.mjs", root, { globalDir }),
    path.join(globalDir, "dual.mjs"),
    "the scope wins over a same-named file in the working directory",
  );
  fs.rmSync(path.join(globalDir, "dual.mjs"));
  assert.equal(
    resolveDoctorPath("dual.mjs", root, { globalDir }),
    path.join(root, "dual.mjs"),
    "a bare slug with no scope hit still falls back to the working directory",
  );
  assert.equal(
    resolveDoctorPath(path.join(root, "dual.mjs"), root, { globalDir }),
    path.join(root, "dual.mjs"),
    "explicit paths keep resolving directly",
  );
  fs.rmSync(root, { recursive: true, force: true });
});
