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
const DOCTOR = path.join(REPO, "doctors", "async-doctor.mjs");
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

test("main: verify wrong-rule finding at the right line fails the gate, naming the rule (D20)", async (t) => {
  const logs = silentConsole(t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-cli-"));
  const doctor = path.join(dir, "two-checks.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'two-checks', description: 'x', severity: 'info',",
    "  checks: [{ id: 'check-a', description: 'a' }, { id: 'check-b', description: 'b' }] }",
    "export async function doctor(ctx) { ctx.report.finding({ rule: 'check-b', file: 'a.ts', line: 1 }) }",
  ].join("\n"));
  fs.writeFileSync(path.join(dir, "two-checks.fixtures.mjs"),
    "export const fixtures = [{ name: 'right line, wrong rule', seed: { 'a.ts': 'x\\n' }, expected: [{ rule: 'check-a', file: 'a.ts', line: 1 }] }]");
  try {
    const code = await cli.main(["verify", doctor]);
    assert.equal(code, 1);
    const out = logs.mock.calls.map((c) => c.arguments.join(" ")).join("\n");
    assert.match(out, /missing expected finding check-a a\.ts:1/);
    assert.match(out, /unexpected finding check-b a\.ts:1/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("main: help exits 0; unknown command exits 1", async (t) => {
  silentConsole(t);
  assert.equal(await cli.main(["help"]), 0);
  assert.equal(await cli.main(["bogus"]), 1);
});

test("main: no arguments runs every discovered doctor (D15 cold start), not usage", async (t) => {
  const { globalDoctorsDir } = await import("../bin/discover.js");
  const global = globalDoctorsDir();
  if (fs.existsSync(global) && fs.readdirSync(global).length > 0) {
    t.skip("user-global doctors would join this cohort — skipping for hermeticity");
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-noargs-"));
  const prevCwd = process.cwd();
  try {
    fs.mkdirSync(path.join(dir, "doctors"));
    fs.writeFileSync(path.join(dir, "doctors", "mini.mjs"), [
      "export const meta = { id: 'mini', description: 'mini', severity: 'info' }",
      "export async function doctor(ctx) {}",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "target.ts"), "export const x = 1;\n");
    process.chdir(dir);
    const logs = silentConsole(t);
    const code = await cli.main([]);
    assert.equal(code, 0);
    const printed = logs.mock.calls.map((c) => String(c.arguments[0])).join("\n");
    assert.match(printed, /Scanned/, "a run report rendered, not the usage wall");
    assert.ok(!printed.includes("generate \""), "usage text did not print");
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

test("main: --global is a generate-only flag", async (t) => {
  silentConsole(t);
  assert.equal(await cli.main(["run", "--global"]), 1);
  assert.equal(await cli.main(["verify", "--global"]), 1);
});

test("main: bare run partitions the cohort — healthy run, unsafe skipped and noted, broken named", async (t) => {
  const logs = silentConsole(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cli-cohort-"));
  fs.mkdirSync(path.join(root, "doctors"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "a.ts"), "const a = 1;\n");
  fs.writeFileSync(path.join(root, "doctors", "good.mjs"), [
    "export const meta = { id: 'good', description: 'g', severity: 'info' }",
    "export async function doctor(ctx) { ctx.report.finding({ file: 'src/a.ts', line: 1 }) }",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "doctors", "evil.mjs"), [
    'import fs from "node:fs";',
    "export const meta = { id: 'evil', description: 'e', severity: 'info' }",
    'export async function doctor(ctx) { fs.writeFileSync("/tmp/x", "1") }',
  ].join("\n"));
  fs.writeFileSync(path.join(root, "doctors", "broken.mjs"), "export async function doctor(ctx) {}");
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const code = await cli.main(["run", "--all"]);
    const out = logs.mock.calls.flatMap(c => c.arguments.map(String)).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    assert.equal(code, 1, "an unsafe skip fails the run");
    assert.match(out, /skipping broken doctor broken —/);
    assert.doesNotMatch(out, /skipping broken doctor (good|evil)/, "healthy and unsafe doctors are never 'broken'");
    assert.match(out, /1 doctor could be malicious — skipped: evil/);
    assert.match(out, /good/);
  } finally {
    process.chdir(cwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("main: only-unsafe discovery names them as skipped, never as broken", async (t) => {
  const logs = silentConsole(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cli-only-unsafe-"));
  fs.mkdirSync(path.join(root, "doctors"));
  fs.writeFileSync(path.join(root, "doctors", "evil.mjs"), [
    'import fs from "node:fs";',
    "export const meta = { id: 'evil', description: 'e', severity: 'info' }",
    'export async function doctor(ctx) { fs.writeFileSync("/tmp/x", "1") }',
  ].join("\n"));
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const code = await cli.main(["verify"]);
    const out = logs.mock.calls.flatMap(c => c.arguments.map(String)).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    assert.equal(code, 1);
    assert.match(out, /1 doctor could be malicious — skipped: evil/);
    assert.doesNotMatch(out, /broken: evil/, "unsafe is not 'broken' on any surface");
  } finally {
    process.chdir(cwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("demo repo: healthy doctors verify fixture-green, gate props are skipped and named", async (t) => {
  const logs = silentConsole(t);
  const demo = path.join(REPO, "demo");
  const cwd = process.cwd();
  process.chdir(demo);
  try {
    const code = await cli.main(["verify", "--all"]);
    const out = logs.mock.calls.flatMap(c => c.arguments.map(String)).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    assert.equal(code, 1, "the two malicious doctors fail the command");
    assert.match(out, /2 doctors could be malicious — skipped: bad, evil/);
    assert.match(out, /todo-doctor/);
    assert.match(out, /console-log-doctor/);
    assert.doesNotMatch(out, /✖/, "every healthy fixture passes");
  } finally {
    process.chdir(cwd);
  }
});

test("main: failures return exit codes, never reject — one failure protocol", async (t) => {
  silentConsole(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cli-exitcode-"));
  const doctor = path.join(root, "fixtureless.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'fixtureless', description: 'f', severity: 'info' }",
    "export async function doctor(ctx) {}",
  ].join("\n"));
  try {
    const code = await cli.main(["verify", doctor]);
    assert.equal(code, 1, "FixturesMissing flattens to a return, not a rejection");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("plantSkill: plants with the provenance marker, refreshes planted copies, never touches user copies", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-plant-"));
  try {
    assert.equal(cli.plantSkill(dir, "SKILL-V1"), "planted");
    const first = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
    assert.ok(first.startsWith("<!-- any-doctor skill plant -->\n"));
    assert.ok(first.endsWith("SKILL-V1"));

    // The skill evolved (a new decision landed) — a planted copy refreshes.
    assert.equal(cli.plantSkill(dir, "SKILL-V2"), "refreshed");
    assert.ok(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8").endsWith("SKILL-V2"));

    // A copy without the marker is the user's: never overwritten.
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "our team conventions\n");
    assert.equal(cli.plantSkill(dir, "SKILL-V3"), "left-user-copy");
    assert.equal(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), "our team conventions\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
