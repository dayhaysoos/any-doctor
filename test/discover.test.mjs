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
  const found = await discoverDoctors(root, { globalDir: path.join(root, "no-global"), bundledDir: path.join(root, "no-bundled") });
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

  const found = await discoverDoctors(root, { globalDir, bundledDir: path.join(root, "no-bundled") });
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
  const found = await discoverDoctors(root, { globalDir: path.join(root, "no-global"), bundledDir: path.join(root, "no-bundled") });
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

const miniDoctor = (id) => [
  `export const meta = { id: '${id}', description: '${id}', severity: 'info' }`,
  "export async function doctor(ctx) {}",
].join("\n");

test("discoverDoctors: the bundled pack is discovered when repo and global are absent", async () => {
  const root = tmp();
  const bundledDir = path.join(root, "pack");
  fs.mkdirSync(bundledDir, { recursive: true });
  fs.writeFileSync(path.join(bundledDir, "convex-doctor.mjs"), miniDoctor("convex-doctor"));
  const cwd = path.join(root, "target");
  fs.mkdirSync(cwd, { recursive: true });
  const found = await discoverDoctors(cwd, { globalDir: path.join(root, "no-global"), bundledDir });
  assert.equal(found.length, 1);
  assert.equal(found[0].slug, "convex-doctor");
  assert.equal(found[0].scope, "bundled");
  fs.rmSync(root, { recursive: true, force: true });
});

test("discoverDoctors: repo beats global beats bundled on slug collisions (D15 order)", async () => {
  const root = tmp();
  const globalDir = path.join(root, "global");
  const bundledDir = path.join(root, "pack");
  fs.mkdirSync(path.join(root, "doctors"), { recursive: true });
  fs.mkdirSync(globalDir, { recursive: true });
  fs.mkdirSync(bundledDir, { recursive: true });
  fs.writeFileSync(path.join(root, "doctors", "shared.mjs"), miniDoctor("repo-copy"));
  fs.writeFileSync(path.join(globalDir, "shared.mjs"), miniDoctor("global-copy"));
  fs.writeFileSync(path.join(bundledDir, "shared.mjs"), miniDoctor("bundled-copy"));

  const allThree = await discoverDoctors(root, { globalDir, bundledDir });
  assert.equal(allThree.filter(d => d.slug === "shared").length, 1);
  assert.equal(allThree.find(d => d.slug === "shared").meta.id, "repo-copy");

  fs.rmSync(path.join(root, "doctors", "shared.mjs"));
  const two = await discoverDoctors(root, { globalDir, bundledDir });
  assert.equal(two.find(d => d.slug === "shared").meta.id, "global-copy", "global beats bundled");
  fs.rmSync(root, { recursive: true, force: true });
});

test("discoverDoctors: the bundled dir that IS the repo dir is scanned once", async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "doctors"));
  fs.writeFileSync(path.join(root, "doctors", "async-doctor.mjs"), pilotSource);
  // bundledDir deliberately equals the repo dir — the in-repo dev layout.
  const found = await discoverDoctors(root, { globalDir: path.join(root, "no-global"), bundledDir: path.join(root, "doctors") });
  const pilots = found.filter(d => d.slug === "async-doctor");
  assert.equal(pilots.length, 1);
  assert.equal(pilots[0].scope, "repo", "the repo scope owns it; bundled does not double-report");
  fs.rmSync(root, { recursive: true, force: true });
});

test("resolveDoctorPath: a bare slug resolves from the bundled pack last", async () => {
  const { resolveDoctorPath } = await import("../bin/discover.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-bundled-resolve-"));
  const globalDir = path.join(root, "global");
  const bundledDir = path.join(root, "pack");
  fs.mkdirSync(globalDir, { recursive: true });
  fs.mkdirSync(bundledDir, { recursive: true });
  fs.writeFileSync(path.join(bundledDir, "convex-doctor.mjs"), miniDoctor("convex-doctor"));
  fs.writeFileSync(path.join(globalDir, "convex-doctor.mjs"), miniDoctor("global-copy"));
  const cwd = path.join(root, "target");
  fs.mkdirSync(cwd, { recursive: true });
  assert.equal(resolveDoctorPath("convex-doctor.mjs", cwd, { globalDir, bundledDir }), path.join(globalDir, "convex-doctor.mjs"), "global first");
  fs.rmSync(path.join(globalDir, "convex-doctor.mjs"));
  assert.equal(resolveDoctorPath("convex-doctor.mjs", cwd, { globalDir, bundledDir }), path.join(bundledDir, "convex-doctor.mjs"), "bundled catches it");
  fs.rmSync(root, { recursive: true, force: true });
});

test("resolveDoctorPath: an extensionless bare slug resolves a scoped doctor (.mjs canonical)", async () => {
  const { resolveDoctorPath } = await import("../bin/discover.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-slug-ext-"));
  const bundledDir = path.join(root, "pack");
  fs.mkdirSync(bundledDir, { recursive: true });
  fs.writeFileSync(path.join(bundledDir, "slop-doctor.mjs"), "export const meta = {}");
  const cwd = path.join(root, "target");
  fs.mkdirSync(cwd, { recursive: true });
  assert.equal(resolveDoctorPath("slop-doctor", cwd, { bundledDir }), path.join(bundledDir, "slop-doctor.mjs"));
  assert.equal(resolveDoctorPath("slop-doctor.mjs", cwd, { bundledDir }), path.join(bundledDir, "slop-doctor.mjs"));
  assert.equal(resolveDoctorPath("no-such-doctor", cwd, { bundledDir }), null, "unknown slug stays null");
  fs.rmSync(root, { recursive: true, force: true });
});
