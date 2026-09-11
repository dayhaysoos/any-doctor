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

// ---- remembered decisions (M2): the CLI end to end ----------------------

test("decisions: decide by scan-resolution, hide on next run, reverse restores", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-m2-"));
  const docDir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-m2-doc-"));
  try {
    // A tiny doctor with a stable finding: file a.ts line 1. The doctor
    // lives OUTSIDE the target (its own source contains the trigger).
    const doctor = path.join(docDir, "marker.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'marker', description: 'flags BAD', severity: 'warning' }",
      "export async function doctor(ctx) {",
      "  for (const f of ctx.files.list()) {",
      "    if (ctx.files.read(f).includes('BAD')) ctx.report.finding({ file: f, line: 1 })",
      "  }",
      "}",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "a.ts"), "const BAD = 1;\n");

    // 1. run before any decision: raw finding, no decisions block
    let log = t.mock.method(console, "log", () => {});
    await cli.main(["run", doctor, dir, "--format", "json"]);
    let j = JSON.parse(log.mock.calls.map(c => c.arguments.join(" ")).join(""));
    assert.equal(j.counts.total, 1);
    assert.equal(j.decisions, undefined, "no decisions block before any decision");
    log.mock.restore();

    // 2. decide with scan resolution (--file/--line)
    let err = t.mock.method(console, "error", () => {});
    let okFn = t.mock.method(console, "log", () => {});
    const code = await cli.main(["decide", "--file", "a.ts", "--line", "1", "--accepted", "--reason", "intentional placeholder", doctor, dir]);
    assert.equal(code, 0, decideErr(err));
    err.mock.restore(); okFn.mock.restore();

    // 3. rescan: the finding is hidden from the report, reviewed line shown,
    //    JSON annotates it and lists the decision; the gate still sees raw.
    log = t.mock.method(console, "log", () => {});
    await cli.main(["run", doctor, dir]);
    const report = log.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.doesNotMatch(report, /a\.ts:1/, "the decided finding is hidden from the active list");
    assert.match(report, /1 finding reviewed and hidden \(1 accepted, 0 not applicable\)/);
    assert.match(report, /any-doctor decisions to inspect/);
    log.mock.restore();

    log = t.mock.method(console, "log", () => {});
    const silent = t.mock.method(console, "error", () => {});
    const runCode = await cli.main(["run", doctor, dir, "--format", "json", "--fail-on", "warning"]);
    const exitCode = runCode; // gate still on raw: decided warning still fails
    j = JSON.parse(log.mock.calls.map(c => c.arguments.join(" ")).join(""));
    assert.equal(j.decisions.applied.length, 1);
    assert.equal(j.decisions.applied[0].disposition, "accepted");
    assert.equal(j.decisions.applied[0].reason, "intentional placeholder");
    const f = j.groups[0].checks[0].findings[0];
    assert.equal(f.decision.disposition, "accepted", "the finding carries its decision");
    assert.ok(f.decisionKey.length > 0, "and its identity key for agents");
    assert.equal(j.gate.fails, true, "local decisions never change CI");
    assert.equal(exitCode, 1, "and the process exit agrees");
    log.mock.restore(); silent.mock.restore();
    void exitCode;

    // 4. decisions list + reverse
    okFn = t.mock.method(console, "log", () => {});
    await cli.main(["decisions", dir]);
    let listed = okFn.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.match(listed, /✓ accepted  marker\/marker  a\.ts:1/);
    assert.match(listed, /intentional placeholder/);
    await cli.main(["decisions", dir, "--reverse", j.decisions.applied[0].key]); // already the printed (encoded) key
    okFn.mock.restore();

    log = t.mock.method(console, "log", () => {});
    await cli.main(["run", doctor, dir, "--format", "json"]);
    j = JSON.parse(log.mock.calls.map(c => c.arguments.join(" ")).join(""));
    assert.equal(j.counts.total, 1, "reversed: the finding is active again");
    assert.equal(j.decisions, undefined, "no decisions remain");
    log.mock.restore();
    assert.equal(exitCode, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function decideErr(errMock) {
  return errMock.mock.calls.map(c => c.arguments.join(" ")).join(" ");
}

test("decisions: changed evidence resurfaces the finding with a reassessment warning", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-m2-2"));
  const docDir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-m2-2-doc-"));
  try {
    const doctor = path.join(docDir, "marker.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'marker', description: 'flags BAD', severity: 'warning' }",
      "export async function doctor(ctx) {",
      "  for (const f of ctx.files.list()) {",
      "    if (ctx.files.read(f).includes('BAD')) ctx.report.finding({ file: f, line: 1 })",
      "  }",
      "}",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "a.ts"), "const BAD = 1;\n");
    const err = t.mock.method(console, "error", () => {});
    const log = t.mock.method(console, "log", () => {});
    assert.equal(await cli.main(["decide", "--file", "a.ts", "--line", "1", "--not-applicable", "--reason", "test fixture", doctor, dir]), 0);
    // the flagged line's content changes — same file:line, different evidence
    fs.writeFileSync(path.join(dir, "a.ts"), "const BAD = 2;\n");
    await cli.main(["run", doctor, dir]);
    const report = log.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.match(report, /a\.ts:1/, "the finding resurfaces — the decision does not carry");
    assert.match(report, /⚠ decision needs reassessment — marker\/marker a\.ts: the evidence changed/);
    err.mock.restore(); log.mock.restore();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("decisions: corrupt state fails the run loudly, never resets", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-m2-3"));
  const docDir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-m2-3-doc-"));
  try {
    const doctor = path.join(docDir, "marker.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'marker', description: 'flags BAD', severity: 'warning' }",
      "export async function doctor(ctx) { ctx.report.finding({ file: 'a.ts', line: 1 }) }",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "a.ts"), "const BAD = 1;\n");
    fs.mkdirSync(path.join(dir, ".any-doctor"));
    fs.writeFileSync(path.join(dir, ".any-doctor", "decisions.local.json"), "{ broken");
    silentConsole(t);
    const err = t.mock.method(console, "error", () => {});
    const code = await cli.main(["run", doctor, dir]);
    assert.equal(code, 1);
    assert.match(err.mock.calls.map(c => c.arguments.join(" ")).join("\n"), /not valid JSON/);
    assert.match(err.mock.calls.map(c => c.arguments.join(" ")).join("\n"), /NOT reset/);
    assert.equal(fs.readFileSync(path.join(dir, ".any-doctor", "decisions.local.json"), "utf8"), "{ broken");
    err.mock.restore();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("decisions: an identity shared by identical copies holds the decision back visibly", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-m2-4"));
  const docDir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-m2-4-doc-"));
  try {
    const doctor = path.join(docDir, "marker.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'marker', description: 'flags BAD', severity: 'warning' }",
      "export async function doctor(ctx) {",
      "  for (const f of ctx.files.list()) {",
      "    const src = ctx.files.read(f)",
      "    src.split('\\n').forEach((l, i) => { if (l.includes('BAD')) ctx.report.finding({ file: f, line: i + 1 }) })",
      "  }",
      "}",
    ].join("\n"));
    // two IDENTICAL lines: same check, same file, same digest/context — one shared identity
    fs.writeFileSync(path.join(dir, "a.ts"), "const BAD = 1;\nconst pad = 2;\nconst BAD = 1;\n");
    const err = t.mock.method(console, "error", () => {});
    const log = t.mock.method(console, "log", () => {});
    assert.equal(await cli.main(["decide", "--file", "a.ts", "--line", "1", "--accepted", "--reason", "one of them", doctor, dir]), 0);
    await cli.main(["run", doctor, dir]);
    const report = log.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.match(report, /a\.ts:1/, "the copies stay active");
    assert.match(report, /a\.ts:3/, "both of them");
    assert.match(report, /⚠ decision held back — marker\/marker a\.ts: 2 identical occurrences share this identity/);
    err.mock.restore(); log.mock.restore();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(docDir, { recursive: true, force: true });
  }
});

test("decisions: keys cross the shell — encoded decide --key and --reverse work; mangled keys refuse", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-m2-5"));
  const docDir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-m2-5-doc-"));
  try {
    const doctor = path.join(docDir, "marker.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'marker', description: 'flags BAD', severity: 'warning' }",
      "export async function doctor(ctx) {",
      "  for (const f of ctx.files.list()) {",
      "    if (ctx.files.read(f).includes('BAD')) ctx.report.finding({ file: f, line: 1 })",
      "  }",
      "}",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "a.ts"), "const BAD = 1;\n");
    silentConsole(t);
    const err = t.mock.method(console, "error", () => {});
    const log = t.mock.method(console, "log", () => {});
    // first run: get the encoded key from JSON (raw keys hold NULs argv cannot carry)
    await cli.main(["run", doctor, dir, "--format", "json"]);
    const j = JSON.parse(log.mock.calls.map(c => c.arguments.join(" ")).join(""));
    const encoded = j.groups[0].checks[0].findings[0].decisionKey;
    assert.ok(/^[A-Za-z0-9_-]+$/.test(encoded), "the exposed key is base64url — no NULs, copy-paste safe");
    // decide --key with the encoded form — and the recorded decision must
    // APPLY on rescan (loop 4 caught it recording a forever-dormant blob)
    assert.equal(await cli.main(["decide", "--key", encoded, "--accepted", "--reason", "via encoded key", doctor, dir]), 0);
    const beforeReverse = log.mock.calls.length;
    await cli.main(["run", doctor, dir, "--format", "json"]);
    const j2 = JSON.parse(log.mock.calls.slice(beforeReverse).map(c => c.arguments.join(" ")).join(""));
    assert.equal(j2.decisions.applied.length, 1, "the encoded-key decision applies on rescan");
    assert.equal(j2.decisions.dormant, 0, "not dormant");
    assert.equal(j2.groups[0].checks[0].findings[0].decision?.reason, "via encoded key");
    // the listing shows the same encoded key, and --reverse accepts it
    await cli.main(["decisions", dir]);
    const listed = log.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.ok(listed.includes(encoded), "the printed key round-trips");
    assert.equal(await cli.main(["decisions", dir, "--reverse", encoded]), 0);
    // a mangled key refuses loudly, records nothing — inspect only the
    // listing AFTER the reverse (the mock transcript is cumulative)
    const callsBefore = log.mock.calls.length;
    assert.equal(await cli.main(["decide", "--key", encoded.slice(0, -2) + "!!", "--accepted", "--reason", "x", dir]), 1);
    await cli.main(["decisions", dir]);
    const after = log.mock.calls.slice(callsBefore).map(c => c.arguments.join(" ")).join("\n");
    assert.ok(!after.includes("via encoded key"), "the refused key recorded nothing");
    err.mock.restore(); log.mock.restore();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(docDir, { recursive: true, force: true });
  }
});

test("decisions: --json is JSON in EVERY state; keys are shell-safe", async (t) => {
  silentConsole(t);
  const log = t.mock.method(console, "log", () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-jsoncons-"));
  try {
    await cli.main(["decisions", dir, "--json"]);
    const empty = JSON.parse(log.mock.calls[0].arguments[0]);
    assert.deepEqual(empty, { schema: 1, decisions: [] }, "empty state is JSON, not prose");
    const docDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-jsoncons-doc-"));
    const doctor = path.join(docDir2, "m.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'm', description: 'x', severity: 'warning' }",
      "export async function doctor(ctx) { ctx.report.finding({ file: 'a.ts', line: 1 }) }",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "a.ts"), "const BAD = 1;\n");
    const err = t.mock.method(console, "error", () => {});
    await cli.main(["decide", "--file", "a.ts", "--line", "1", "--accepted", "--reason", "r", doctor, dir]);
    await cli.main(["decisions", dir, "--json"]);
    const j = JSON.parse(log.mock.calls.at(-1).arguments[0]);
    assert.equal(j.decisions.length, 1);
    assert.ok(/^[A-Za-z0-9_-]+$/.test(j.decisions[0].key), "the exported key is base64url — usable in a shell");
    assert.ok(!j.decisions[0].key.includes("\u0000"), "no NULs in machine output");
    err.mock.restore();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("decisions: a columned finding decides and hides precisely (scan→decide→rescan)", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-col-"));
  const docDir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-col-doc-"));
  try {
    const doctor = path.join(docDir, "twins.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'twins', description: 'flags BAD', severity: 'warning' }",
      "export async function doctor(ctx) {",
      "  for (const f of ctx.files.list()) {",
      "    const src = ctx.files.read(f)",
      "    src.split('\\n').forEach((l, i) => {",
      "      let c = -1",
      "      while ((c = l.indexOf('BAD', c + 1)) !== -1) ctx.report.finding({ file: f, line: i + 1, column: c })",
      "    })",
      "  }",
      "}",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "a.ts"), "const x = wrap(BAD, BAD);\n");
    silentConsole(t);
    const err = t.mock.method(console, "error", () => {});
    const log = t.mock.method(console, "log", () => {});
    // decide the FIRST columned occurrence only
    assert.equal(await cli.main(["decide", "--file", "a.ts", "--line", "1", "--accepted", "--reason", "first only", doctor, dir]), 0);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, ".any-doctor", "decisions.local.json"), "utf8")).decisions[0];
    assert.ok(stored.key.includes("a.ts"), "the key resolved (not empty)");
    assert.ok(stored.provenance !== undefined, "the record carries provenance");
    // rescan: ONE of the two same-line findings hides; the other stays
    await cli.main(["run", doctor, dir]);
    const report = log.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.match(report, /1 finding reviewed and hidden/);
    assert.match(report, /a\.ts:1/, "the second same-line finding stays active");
    const jsonLog = t.mock.method(console, "log", () => {});
    await cli.main(["run", doctor, dir, "--format", "json"]);
    const json = JSON.parse(jsonLog.mock.calls.map(c => c.arguments.join(" ")).join(""));
    jsonLog.mock.restore();
    // JSON carries the RAW picture with annotations (agents see everything):
    // both same-line findings present, exactly one decided.
    const findings = json.groups.flatMap(g => g.checks.flatMap(c => c.findings));
    assert.equal(findings.length, 2, "raw JSON keeps both occurrences");
    assert.equal(findings.filter(f => f.decision !== undefined).length, 1, "exactly one carries the decision");
    assert.ok(findings.every(f => f.decisionKey !== undefined), "both carry their own distinct keys");
    err.mock.restore(); log.mock.restore();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(docDir, { recursive: true, force: true });
  }
});

test("decisions: unknown flags refuse; ambiguous decisions surface in the report", async (t) => {
  silentConsole(t);
  const err = t.mock.method(console, "error", () => {});
  assert.equal(await cli.main(["decisions", ".", "--revrse", "abc"]), 1, "a typo'd flag refuses, never silently no-ops");
  assert.match(err.mock.calls.map(c => c.arguments.join(" ")).join("\n"), /unknown flag --revrse/);
  err.mock.restore();
});

// ---- the agent interface (help agents, piped hint, adoption tip) ---------

test("agent surface: help agents prints the machine-interface doc", async (t) => {
  const log = t.mock.method(console, "log", () => {});
  const code = await cli.main(["help", "agents"]);
  assert.equal(code, 0);
  const doc = log.mock.calls.map(c => c.arguments.join(" ")).join("\n");
  assert.match(doc, /--format json/, "the scan command");
  assert.match(doc, /decisionKey/, "the identity key");
  assert.match(doc, /decide --key/, "the decision verb");
  assert.match(doc, /delegated authority/, "the authority rule");
  log.mock.restore();
});

test("agent surface: the piped hint rides stderr, never JSON stdout, never a TTY", async (t) => {
  // The test harness's stdout is not a TTY — exactly the piped condition.
  const err = t.mock.method(console, "error", () => {});
  const log = t.mock.method(console, "log", () => {});
  await cli.main(["run", DOCTOR, TARGET]);
  const stderr = err.mock.calls.map(c => c.arguments.join(" ")).join("\n");
  assert.match(stderr, /--format json/, "the hint points at the machine surface");
  assert.match(stderr, /help agents/, "and at the doc");
  // JSON mode: no hint anywhere near stdout
  err.mock.reset?.(); log.mock.reset?.();
  const err2 = t.mock.method(console, "error", () => {});
  const log2 = t.mock.method(console, "log", () => {});
  await cli.main(["run", DOCTOR, TARGET, "--format", "json"]);
  const jsonText = log2.mock.calls.map(c => c.arguments.join(" ")).join("");
  assert.doesNotMatch(jsonText, /help agents/, "stdout JSON is pure");
  assert.ok(JSON.parse(jsonText).schema === 1, "still parseable");
  void err; void log; err2.mock.restore(); log2.mock.restore();
});

test("agent surface: the AGENTS.md tip fires once, on the first decision", async (t) => {
  silentConsole(t);
  const err = t.mock.method(console, "error", () => {});
  const log = t.mock.method(console, "log", () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-tip-"));
  const docDir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-tip-doc-"));
  try {
    const doctor = path.join(docDir, "m.mjs");
    fs.writeFileSync(doctor, [
      "export const meta = { id: 'm', description: 'x', severity: 'warning' }",
      "export async function doctor(ctx) { ctx.report.finding({ file: 'a.ts', line: 1 }) }",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "a.ts"), "const BAD = 1;\n");
    await cli.main(["decide", "--file", "a.ts", "--line", "1", "--accepted", "--reason", "first", doctor, dir]);
    let out = log.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.match(out, /add the agent workflow to this repo's AGENTS\.md/, "the tip fires on the first decision");
    assert.match(out, /help agents/, "and names the paste source");
    log.mock.restore();
    const log2 = t.mock.method(console, "log", () => {});
    await cli.main(["decide", "--file", "a.ts", "--line", "1", "--not-applicable", "--reason", "second", doctor, dir]);
    out = log2.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.doesNotMatch(out, /AGENTS\.md/, "the second decision is tip-free");
    log2.mock.restore();
    err.mock.restore();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(docDir, { recursive: true, force: true });
  }
});

// ---- agent-interface review fixes ------------------------------------------

test("agent surface: a broken doctor fails ALWAYS and never corrupts JSON stdout", async (t) => {
  silentConsole(t);
  const err = t.mock.method(console, "error", () => {});
  const log = t.mock.method(console, "log", () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-broken-"));
  try {
    // A local broken doctor (no metadata) SHADOWS discovery; with an explicit
    // valid doctor path alongside, the run must still fail always.
    fs.mkdirSync(path.join(dir, "doctors"), { recursive: true });
    fs.writeFileSync(path.join(dir, "doctors", "async-doctor.mjs"), "not a doctor\n");
    fs.writeFileSync(path.join(dir, "a.ts"), "const x = 1;\n");
    // Discovery walks from cwd — run from inside the target, as the
    // reviewer's probe did, so the local broken doctor is discovered.
    const cwd = process.cwd();
    process.chdir(dir);
    let code;
    try {
      code = await cli.main(["run", "--all", "--format", "json", "--fail-on", "warning"]);
    } finally {
      process.chdir(cwd);
    }
    assert.equal(code, 1, "a broken doctor fails the run regardless of the bar");
    const text = log.mock.calls.map(c => c.arguments.join(" ")).join("");
    const j = JSON.parse(text); // pure JSON — the warning rode stderr
    assert.ok(Array.isArray(j.broken) && j.broken.some(b => b.id === "async-doctor"),
      "the broken doctor is structured failure data in JSON");
    assert.equal(j.score.partialScan, true, "a broken scan withholds the grade");
    assert.equal(j.score.score, null, "the invalidated number is nulled, not 100-with-a-flag");
    assert.equal(j.score.grade, null, "and the grade word too");
    const stderr = err.mock.calls.map(c => c.arguments.join(" ")).join("\n");
    assert.match(stderr, /skipping broken doctor async-doctor/, "the human warning is on stderr");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent surface: JSON checks carry impact/why/fix when declared", async (t) => {
  const log = t.mock.method(console, "log", () => {});
  await cli.main(["run", DOCTOR, TARGET, "--format", "json"]);
  const j = JSON.parse(log.mock.calls.map(c => c.arguments.join(" ")).join(""));
  const checks = j.groups.flatMap(g => g.checks);
  assert.ok(checks.length > 0);
  assert.ok(checks.some(c => c.impact !== undefined || c.why !== undefined || c.fix !== undefined),
    "at least one bundled check exposes its explanation fields");
  log.mock.restore();
});


test("agent surface: all-broken discovery still emits structured JSON", async (t) => {
  silentConsole(t);
  const err = t.mock.method(console, "error", () => {});
  const log = t.mock.method(console, "log", () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-allbroken-"));
  try {
    fs.mkdirSync(path.join(dir, "doctors"), { recursive: true });
    // Break every discoverable slug by shadowing the bundled names.
    for (const slug of ["async-doctor", "convex-doctor", "effect-v4-doctor", "openrouter-doctor", "slop-doctor"]) {
      fs.writeFileSync(path.join(dir, "doctors", slug + ".mjs"), "not a doctor\n");
    }
    fs.writeFileSync(path.join(dir, "a.ts"), "const x = 1;\n");
    const cwd = process.cwd();
    process.chdir(dir);
    let code;
    try {
      code = await cli.main(["run", "--all", "--format", "json"]);
    } finally {
      process.chdir(cwd);
    }
    assert.equal(code, 1, "all-broken fails");
    const text = log.mock.calls.map(c => c.arguments.join(" ")).join("");
    const j = JSON.parse(text); // stdout is still one parseable object
    assert.equal(j.broken.length, 5, "every broken doctor is structured data");
    assert.equal(j.groups.length, 0);
    err.mock.restore();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
