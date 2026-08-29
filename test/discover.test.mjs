import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { discoverDoctors } = require("../bin/discover.js");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pilotSource = fs.readFileSync(path.join(repoRoot, "doctors", "unawaited-async-map.mjs"), "utf8");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-discover-"));
}

test("discoverDoctors: finds repo-scope doctor with real meta", async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "doctors"));
  fs.writeFileSync(path.join(root, "doctors", "unawaited-async-map.mjs"), pilotSource);
  const found = discoverDoctors(root, { globalDir: path.join(root, "no-global") });
  assert.equal(found.length, 1);
  assert.equal(found[0].slug, "unawaited-async-map");
  assert.equal(found[0].scope, "repo");
  assert.equal(found[0].meta.id, "unawaited-async-map");
  assert.ok(Array.isArray(found[0].meta.blindSpots));
  fs.rmSync(root, { recursive: true, force: true });
});

test("discoverDoctors: global scope found, repo wins slug collisions", async () => {
  const root = tmp();
  const globalDir = path.join(root, "global");
  fs.mkdirSync(path.join(root, "doctors"), { recursive: true });
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(path.join(root, "doctors", "unawaited-async-map.mjs"), pilotSource);
  fs.writeFileSync(path.join(globalDir, "other.mjs"), [
    "export const meta = { id: 'other', description: 'other', severity: 'info' }",
    "export async function doctor(ctx) {}",
  ].join("\n"));
  fs.writeFileSync(path.join(globalDir, "unawaited-async-map.mjs"), pilotSource);

  const found = discoverDoctors(root, { globalDir });
  assert.equal(found.length, 2);
  const pilot = found.find(d => d.slug === "unawaited-async-map");
  assert.equal(pilot.scope, "repo");
  assert.equal(found.find(d => d.slug === "other").scope, "global");
  fs.rmSync(root, { recursive: true, force: true });
});

test("discoverDoctors: broken doctor surfaces with error, fixture files ignored", async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "doctors"));
  fs.writeFileSync(path.join(root, "doctors", "broken.mjs"), "export async function doctor(ctx) {}");
  fs.writeFileSync(path.join(root, "doctors", "unawaited-async-map.fixtures.mjs"), "export const fixtures = []");
  const found = discoverDoctors(root, { globalDir: path.join(root, "no-global") });
  assert.equal(found.length, 1);
  assert.equal(found[0].slug, "broken");
  assert.equal(found[0].meta, null);
  assert.match(found[0].error, /meta/);
  fs.rmSync(root, { recursive: true, force: true });
});
