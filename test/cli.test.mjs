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
