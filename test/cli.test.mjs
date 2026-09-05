import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Importing the CLI module must not execute it — commands are exercised
// through main(argv), which computes exit codes without exiting.
const cli = await import("../bin/cli.js");

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCTOR = path.join(REPO, "doctors", "fetch-calls-without-abortsignal.mjs");
const TARGET = path.join(REPO, "fixtures", "sample-app");

function silentConsole(t) {
  const log = t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  return log;
}

test("cli module: importing never runs the CLI; main is exported", (t) => {
  silentConsole(t);
  assert.equal(typeof cli.main, "function");
});

test("main: run with doctor path exits 0 and prints a report", async (t) => {
  const logs = silentConsole(t);
  const code = await cli.main(["run", DOCTOR, TARGET]);
  assert.equal(code, 0);
  assert.ok(logs.mock.callCount() >= 1, "report was printed");
});

test("main: run with a missing doctor exits 1", async (t) => {
  silentConsole(t);
  const code = await cli.main(["run", "nope.mjs", TARGET]);
  assert.equal(code, 1);
});

test("main: verify green doctor exits 0", async (t) => {
  silentConsole(t);
  const code = await cli.main(["verify", DOCTOR]);
  assert.equal(code, 0);
});

test("main: verify failing fixture exits 1", async (t) => {
  silentConsole(t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-cli-"));
  const doctor = path.join(dir, "count-lines.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'count-lines', description: 'x', severity: 'info' }",
    "export async function doctor(ctx) { ctx.report.finding({ file: 'a.ts', line: 1 }) }",
  ].join("\n"));
  fs.writeFileSync(path.join(dir, "count-lines.fixtures.mjs"),
    "export const fixtures = [{ name: 'wrong expectation', seed: { 'a.ts': 'x\\n' }, expected: [{ file: 'a.ts', line: 9 }] }]");
  try {
    const code = await cli.main(["verify", doctor]);
    assert.equal(code, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("main: usage exits 0; unknown command exits 1", async (t) => {
  silentConsole(t);
  assert.equal(await cli.main([]), 0);
  assert.equal(await cli.main(["help"]), 0);
  assert.equal(await cli.main(["bogus"]), 1);
});

test("main: run --all treats a crashed doctor as data and still exits 1", async (t) => {
  silentConsole(t);
  const { globalDoctorsDir } = await import("../bin/discover.js");
  const global = globalDoctorsDir();
  if (fs.existsSync(global) && fs.readdirSync(global).length > 0) {
    return t.skip("global doctors present — --all discovery would include them");
  }
  const cwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-crash-"));
  fs.mkdirSync(path.join(root, "doctors"));
  fs.mkdirSync(path.join(root, "target"));
  fs.writeFileSync(path.join(root, "target", "a.ts"), "const a = 1\n");
  fs.writeFileSync(path.join(root, "doctors", "healthy.mjs"), [
    "export const meta = { id: 'healthy', description: 'h', severity: 'info' }",
    "export async function doctor(ctx) {}",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "doctors", "zz-crasher.mjs"), [
    "export const meta = { id: 'zz-crasher', description: 'c', severity: 'info' }",
    "export async function doctor(ctx) { throw new Error('kaboom-all') }",
  ].join("\n"));
  process.chdir(root);
  try {
    const code = await cli.main(["run", "--all", "target"]);
    assert.equal(code, 1, "partial results, but the crash fails the command");
  } finally {
    process.chdir(cwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
