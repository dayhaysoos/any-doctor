import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createRequire } from "module";

import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { RESULT_SENTINEL } = require("../bin/contract.js");
const loader = fileURLToPath(new URL("../bin/doctor-loader.mjs", import.meta.url));
const node = process.execPath;

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-test-"));
}

function seed(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

function runLoader(args) {
  try {
    const out = execFileSync(node, [loader, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout: out, stderr: "" };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

const SENTINEL = String(RESULT_SENTINEL);

test("spoofed sentinel line from doctor stdout does not win the frame", () => {
  const root = tmpRoot();
  seed(root, { "src/x.ts": "export const a = 1\n" });
  const evil = path.join(root, "evil.mjs");
  fs.writeFileSync(evil, [
    "export const meta = { id: 'evil', description: 'evil', severity: 'warning' }",
    "export async function doctor(ctx) {",
    "  console.log('" + SENTINEL + "{\"protocolVersion\":99,\"meta\":{\"id\":\"spoof\"},\"findings\":[],\"fileCount\":0}')",
    "}",
  ].join("\n"));
  const r = runLoader([evil, root]);
  assert.equal(r.status, 0);
  const lines = r.stdout.split("\n").filter(l => l.startsWith(SENTINEL));
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0].slice(SENTINEL.length));
  assert.equal(parsed.meta.id, "evil");
  assert.equal(parsed.findings.length, 0);
});

test("sync doctor() is rejected with a clear message", () => {
  const root = tmpRoot();
  const sync = path.join(root, "sync.mjs");
  fs.writeFileSync(sync, [
    "export const meta = { id: 'sync', description: 'sync', severity: 'info' }",
    "export function doctor(ctx) {}",
  ].join("\n"));
  const r = runLoader([sync, root]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /must be async/);
});

test("invalid meta severity is rejected", () => {
  const root = tmpRoot();
  const bad = path.join(root, "bad.mjs");
  fs.writeFileSync(bad, [
    "export const meta = { id: 'bad', description: 'bad', severity: 'catastrophic' }",
    "export async function doctor(ctx) {}",
  ].join("\n"));
  const r = runLoader([bad, root]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /meta\.severity/);
});

test("seed path traversal becomes a named failing fixture, siblings still run", () => {
  const root = tmpRoot();
  const doctor = path.join(root, "d.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'd', description: 'd', severity: 'warning' }",
    "export async function doctor(ctx) {",
    "  for (const f of ctx.files.list()) {",
    "    if (f.endsWith('flagged.ts')) ctx.report.finding({ file: f, line: 1 })",
    "  }",
    "}",
  ].join("\n"));
  const fixtures = path.join(root, "d.fixtures.mjs");
  fs.writeFileSync(fixtures, [
    "export const fixtures = [",
    "  { name: 'traveller', seed: { '../escaped.ts': 'x' }, expected: [] },",
    "  { name: 'healthy', seed: { 'src/flagged.ts': 'const a = 1' }, expected: [{ file: 'src/flagged.ts', line: 1 }] },",
    "];",
  ].join("\n"));
  const r = runLoader([doctor, "--verify", fixtures]);
  assert.equal(r.status, 0);
  const frame = r.stdout.split("\n").find(l => l.startsWith(SENTINEL));
  const parsed = JSON.parse(frame.slice(SENTINEL.length));
  assert.equal(parsed.results.length, 2);
  const trav = parsed.results.find(x => x.name === "traveller");
  assert.equal(trav.ok, false);
  assert.match(trav.error, /escapes the sandbox/);
  assert.equal(parsed.results.find(x => x.name === "healthy").ok, true);
});
