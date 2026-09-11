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

test("main: run with a crashing doctor exits 1 — crash as data, the report still renders", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-cli-crash-"));
  try {
    const doctor = path.join(dir, "boom.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'boom', description: 'x', severity: 'info' }",
      "export async function doctor(ctx) { throw new Error('kaboom') }",
    ].join("\n"));
    const err = t.mock.method(console, "error", () => {});
    const log = t.mock.method(console, "log", () => {});
    const code = await cli.main(["run", doctor, TARGET]);
    assert.equal(code, 1);
    const errs = err.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    const logs = log.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.match(errs, /kaboom/, "the crash detail prints");
    assert.match(logs, /every doctor crashed before completing a scan \(boom;/, "a single crashed doctor is a cohort of one — its outcome renders");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("main: run against a nonexistent target refuses in one line, no loader stack", async (t) => {
  const err = t.mock.method(console, "error", () => {});
  const code = await cli.main(["run", DOCTOR, path.join(os.tmpdir(), "any-doctor-no-such-dir")]);
  assert.equal(code, 1);
  const printed = err.mock.calls.map(c => c.arguments.join(" ")).join("\n");
  assert.match(printed, /target directory not found: /);
  assert.ok(!printed.includes("at "), "a configuration error never renders a stack trace");
});

test("runSpinner: a non-TTY stdio pair constructs nothing — headless stays byte-clean", () => {
  // The test runner's own stdio is piped, which is exactly the
  // environment the gate must refuse: no spinner bytes, no cursor hide.
  assert.equal(cli.runSpinner("running doctors", 2), null);
});

test("main: run against a file-as-target names the real problem", async (t) => {
  const err = t.mock.method(console, "error", () => {});
  const notADir = path.join(os.tmpdir(), "any-doctor-not-a-dir");
  fs.writeFileSync(notADir, "x");
  try {
    const code = await cli.main(["run", DOCTOR, notADir]);
    assert.equal(code, 1);
    const printed = err.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.match(printed, /target is not a directory: /);
  } finally {
    fs.rmSync(notADir, { force: true });
  }
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
    "  checks: [{ id: 'check-a', description: 'a', claim: 'shape a', lookalikes: ['not a'] }, { id: 'check-b', description: 'b', claim: 'shape b', lookalikes: ['not b'] }] }",
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
  // Slop-free seed (slop-doctor joined the pack and correctly flagged the
  // old `const a = 1` as an unread local, deduping good's finding away):
  // index.ts is entry-exempt, and `a` is read by the export.
  fs.writeFileSync(path.join(root, "src", "index.ts"), "const a = 1;\nexport const b = a;\n");
  fs.writeFileSync(path.join(root, "doctors", "good.mjs"), [
    "export const meta = { id: 'good', description: 'g', severity: 'info' }",
    "export async function doctor(ctx) { ctx.report.finding({ file: 'src/index.ts', line: 1 }) }",
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
    const errs = t.mock.method(console, "error", () => {});
    const code = await cli.main(["run", "--all"]);
    const out = logs.mock.calls.flatMap(c => c.arguments.map(String)).concat(errs.mock.calls.flatMap(c => c.arguments.map(String))).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
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
    const errs = t.mock.method(console, "error", () => {});
    const code = await cli.main(["verify"]);
    const out = logs.mock.calls.concat(errs.mock.calls).flatMap(c => c.arguments.map(String)).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
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
    const errs = t.mock.method(console, "error", () => {});
    const code = await cli.main(["verify", "--all"]);
    const out = logs.mock.calls.concat(errs.mock.calls).flatMap(c => c.arguments.map(String)).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
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

// ---- the Gate chapter: --format json, --fail-on, --base -----------------

test("gate: --format json puts one parseable schema-tagged object on stdout", async (t) => {
  const log = t.mock.method(console, "log", () => {});
  const code = await cli.main(["run", DOCTOR, TARGET, "--format", "json"]);
  assert.equal(code, 0);
  const printed = log.mock.calls.map(c => c.arguments.join(" ")).join("");
  const j = JSON.parse(printed);
  assert.equal(j.schema, 1);
  assert.equal(j.tool, "any-doctor");
  assert.ok(j.counts.total > 0, "findings counted");
  assert.equal(j.groups[0].doctor, "async-doctor");
  assert.deepEqual(j.crashed, []);
  assert.equal(j.gate.failOn, "none");
  assert.equal(j.gate.fails, false);
  assert.equal(j.diff, undefined, "no diff without --base");
});

test("gate: --fail-on warning fails the sample app; error and none do not", async (t) => {
  silentConsole(t);
  const err = t.mock.method(console, "error", () => {});
  assert.equal(await cli.main(["run", DOCTOR, TARGET, "--fail-on", "warning"]), 1, "4 warnings clear the warning bar");
  const printed = err.mock.calls.map(c => c.arguments.join(" ")).join("\n");
  assert.match(printed, /gate: \d+ findings at or above warning/);
  assert.equal(await cli.main(["run", DOCTOR, TARGET, "--fail-on", "error"]), 0, "no errors in the sample app");
  assert.equal(await cli.main(["run", DOCTOR, TARGET]), 0, "advisory default");
});

test("gate: bad flag values refuse with the allowed choices", async (t) => {
  silentConsole(t);
  const err = t.mock.method(console, "error", () => {});
  assert.equal(await cli.main(["run", DOCTOR, TARGET, "--fail-on", "warn"]), 1);
  assert.match(err.mock.calls.map(c => c.arguments.join(" ")).join("\n"), /--fail-on must be one of none, error, warning, info/);
  assert.equal(await cli.main(["run", DOCTOR, TARGET, "--format", "yaml"]), 1);
  assert.match(err.mock.calls.map(c => c.arguments.join(" ")).join("\n"), /--format must be "report" or "json"/);
});

test("gate: --base against HEAD adds nothing — advisory findings pass, pre-existing debt is not blamed", async (t) => {
  const log = t.mock.method(console, "log", () => {});
  const code = await cli.main(["run", DOCTOR, TARGET, "--base", "HEAD", "--fail-on", "warning"]);
  assert.equal(code, 0, "identical trees: zero added findings, the bar holds");
  const printed = log.mock.calls.map(c => c.arguments.join(" ")).join("\n");
  assert.match(printed, /vs HEAD \(merged base\): 0 added · \d+ continuing · 0 no longer detected/, "the report carries the diff line");
});

test("gate: json output stays parseable when a doctor crashes — detail on stderr, exit 1", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-gate-crash-"));
  try {
    const doctor = path.join(dir, "boom.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'boom', description: 'x', severity: 'info' }",
      "export async function doctor(ctx) { throw new Error('kaboom') }",
    ].join("\n"));
    const log = t.mock.method(console, "log", () => {});
    const err = t.mock.method(console, "error", () => {});
    const code = await cli.main(["run", doctor, TARGET, "--format", "json", "--fail-on", "none"]);
    assert.equal(code, 1, "a crash fails regardless of the bar");
    const j = JSON.parse(log.mock.calls.map(c => c.arguments.join(" ")).join(""));
    assert.equal(j.crashed.length, 1);
    assert.match(j.crashed[0].detail, /kaboom/);
    assert.match(err.mock.calls.map(c => c.arguments.join(" ")).join("\n"), /kaboom/, "human diagnostics stay on stderr");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test("gate: a dangling --base refuses — never silently full mode", async (t) => {
  silentConsole(t);
  const err = t.mock.method(console, "error", () => {});
  assert.equal(await cli.main(["run", DOCTOR, TARGET, "--base"]), 1);
  assert.match(err.mock.calls.map(c => c.arguments.join(" ")).join("\n"), /--base needs a value \(a git ref, e\.g\. --base main\)/);
  assert.equal(await cli.main(["run", DOCTOR, TARGET, "--base", "--all"]), 1, "a flag-shaped value is not a ref");
});

test("gate: verify refuses the run-only gate flags", async (t) => {
  silentConsole(t);
  const err = t.mock.method(console, "error", () => {});
  assert.equal(await cli.main(["verify", DOCTOR, "--fail-on", "error"]), 1);
  assert.equal(await cli.main(["verify", DOCTOR, "--format", "json"]), 1);
  assert.equal(await cli.main(["verify", DOCTOR, "--base", "main"]), 1);
  assert.match(err.mock.calls.map(c => c.arguments.join(" ")).join("\n"), /run-only flags/);
});

// Dogfood find (sift-skills, 134KB payload): process.exit() cuts off a
// piped stdout at the 64KB pipe-buffer boundary — --format json arrived
// truncated on real repos while every small fixture passed. The guard
// now sets exitCode and lets Node flush. Only a real child through a
// real pipe can pin this; in-process main() calls cannot.
test("gate: --format json survives a pipe at payload sizes past 64KB", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-pipe-"));
  const doctorDir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-pipe-doc-"));
  try {
    // The doctor lives outside the target: its own source contains the
    // trigger word and would flag itself.
    const doctor = path.join(doctorDir, "many.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'many', description: 'one finding per BAD line', severity: 'info' }",
      "export async function doctor(ctx) {",
      "  for (const file of ctx.files.list()) {",
      "    ctx.files.read(file).split('\\n').forEach((line, i) => {",
      '      if (line.includes("BAD")) ctx.report.finding({ file, line: i + 1, message: "padding padding padding padding" })',
      "    })",
      "  }",
      "}",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "big.ts"), "const BAD = 1\n".repeat(3000));
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, [path.join(REPO, "bin", "cli.js"), "run", doctor, dir, "--format", "json"], {
      env: { ...process.env, ANY_DOCTOR_HEADLESS: "1" },
    });
    let stdout = "";
    child.stdout.on("data", (c) => { stdout += c; });
    await new Promise((resolve) => child.on("close", resolve));
    assert.ok(stdout.length > 65536, `payload must exceed one pipe buffer (got ${stdout.length})`);
    const j = JSON.parse(stdout);
    assert.equal(j.counts.total, 3000, "every finding survived the pipe");
    assert.equal(child.exitCode, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(doctorDir, { recursive: true, force: true });
  }
});

test("main: an extensionless bare slug resolves a scoped doctor and still takes a target dir", async (t) => {
  const logs = silentConsole(t);
  const cwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-bare-slug-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "index.ts"), "const a = 1;\nexport const b = a;\n");
  process.chdir(root);
  try {
    const code = await cli.main(["run", "slop-doctor", "src"]);
    assert.equal(code, 0, "bundled slop-doctor resolved by bare slug, scanned the target");
    const out = logs.mock.calls.flatMap(c => c.arguments.map(String)).join("\n");
    assert.match(out, /Any Doctor — 1 doctor/, "exactly one doctor ran (a clean report never names it)");
  } finally {
    process.chdir(cwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("main: a bare token that is a directory stays the target, not a slug", async (t) => {
  const logs = silentConsole(t);
  const cwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-bare-dir-"));
  fs.mkdirSync(path.join(root, "build"));
  fs.writeFileSync(path.join(root, "build", "index.ts"), "export const b = 1;\n");
  process.chdir(root);
  try {
    // Non-TTY: no selector. The bundled pack runs against build/ — one
    // file scanned proves the token was the target directory, not a slug
    // hijacked into doctor resolution (the pre-fix run crashed trying to
    // execute a directory, or failed as not-found).
    const code = await cli.main(["run", "build"]);
    assert.equal(code, 0);
    const out = logs.mock.calls.flatMap(c => c.arguments.map(String)).join("\n");
    assert.match(out, /Scanned 1 file/, "the build directory was the scanned target");
  } finally {
    process.chdir(cwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("crash reporting: the error's reason line survives to the CLI surface", async (t) => {
  silentConsole(t);
  const err = t.mock.method(console, "error", () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-crash-msg-"));
  try {
    // The reason ("Error: <why>") lands at the TOP of the child's
    // stderr with the stack trailing; a deep stack is exactly what the
    // old last-8-lines capture threw away. The wording mirrors the
    // engine's missing-binary explanation.
    const doctor = path.join(dir, "deepboom.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'deepboom', description: 'x', severity: 'info' }",
      "function f7() { throw new Error('ctx.search needs the ast-grep engine: it ships with any-doctor') }",
      "function f6() { return f7() }",
      "function f5() { return f6() }",
      "function f4() { return f5() }",
      "function f3() { return f4() }",
      "function f2() { return f3() }",
      "function f1() { return f2() }",
      "export async function doctor(ctx) { f1() }",
    ].join("\n"));
    const code = await cli.main(["run", doctor, TARGET]);
    assert.equal(code, 1, "the crash fails the run");
    const printed = err.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.match(printed, /ctx\.search needs the ast-grep engine: it ships with any-doctor/,
      "the reason line — not just stack tail — reaches the user");
    assert.match(printed, /at f/, "and the stack tail survives alongside it");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test("partial scans: the JSON score carries partialScan for machine consumers", async (t) => {
  const log = t.mock.method(console, "log", () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-partial-json-"));
  try {
    const doctor = path.join(dir, "boom.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'boom', description: 'x', severity: 'info' }",
      "export async function doctor(ctx) { throw new Error('kaboom json') }",
    ].join("\n"));
    await cli.main(["run", doctor, TARGET, "--format", "json"]);
    const j = JSON.parse(log.mock.calls.map(c => c.arguments.join(" ")).join(""));
    assert.equal(j.score.partialScan, true, "the machine surface sees the partial flag");
    assert.equal(j.crashed.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
