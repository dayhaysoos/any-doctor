import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { fileURLToPath } from "url";

const { RESULT_SENTINEL } = (await import("../bin/contract.js"));
const { permissionArgs } = (await import("../bin/runner.js"));
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

// Children spawn in exactly the configuration production creates: the
// runner's own permission flags and a four-pipe stdio (fd 3 is the search
// channel). Verify runs additionally get temp-dir writes for fixture
// sandboxes — mirroring permissionArgs(true).
async function runLoader(args) {
  const flags = await permissionArgs(args.includes("--verify"));
  try {
    const out = execFileSync(node, [...flags, loader, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe", "pipe"] });
    return { status: 0, stdout: out, stderr: "" };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

const SENTINEL = String(RESULT_SENTINEL);

test("spoofed sentinel line from doctor stdout does not win the frame", async () => {
  const root = tmpRoot();
  seed(root, { "src/x.ts": "export const a = 1\n" });
  const evil = path.join(root, "evil.mjs");
  fs.writeFileSync(evil, [
    "export const meta = { id: 'evil', description: 'evil', severity: 'warning' }",
    "export async function doctor(ctx) {",
    "  console.log('" + SENTINEL + "{\"protocolVersion\":99,\"meta\":{\"id\":\"spoof\"},\"findings\":[],\"fileCount\":0}')",
    "}",
  ].join("\n"));
  const r = await runLoader([evil, root]);
  assert.equal(r.status, 0);
  const lines = r.stdout.split("\n").filter(l => l.startsWith(SENTINEL));
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0].slice(SENTINEL.length));
  assert.equal(parsed.meta.id, "evil");
  assert.equal(parsed.findings.length, 0);
});

test("sync doctor() is rejected with a clear message", async () => {
  const root = tmpRoot();
  const sync = path.join(root, "sync.mjs");
  fs.writeFileSync(sync, [
    "export const meta = { id: 'sync', description: 'sync', severity: 'info' }",
    "export function doctor(ctx) {}",
  ].join("\n"));
  const r = await runLoader([sync, root]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /must be async/);
});

test("invalid meta severity is rejected", async () => {
  const root = tmpRoot();
  const bad = path.join(root, "bad.mjs");
  fs.writeFileSync(bad, [
    "export const meta = { id: 'bad', description: 'bad', severity: 'catastrophic' }",
    "export async function doctor(ctx) {}",
  ].join("\n"));
  const r = await runLoader([bad, root]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /meta\.severity/);
});

test("seed path traversal becomes a named failing fixture, siblings still run", async () => {
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
  const r = await runLoader([doctor, "--verify", fixtures]);
  assert.equal(r.status, 0);
  const frame = r.stdout.split("\n").find(l => l.startsWith(SENTINEL));
  const parsed = JSON.parse(frame.slice(SENTINEL.length));
  assert.equal(parsed.results.length, 4); // + shared innocent corpus + duplicate-location probe
  const trav = parsed.results.find(x => x.name === "traveller");
  assert.equal(trav.ok, false);
  assert.match(trav.error, /escapes the sandbox/);
  assert.equal(parsed.results.find(x => x.name === "healthy").ok, true);
});

test("ctx.files.read refuses to escape the repo root", async () => {
  const root = tmpRoot();
  seed(root, { "src/x.ts": "export const a = 1\n" });
  const traveller = path.join(root, "traveller.mjs");
  fs.writeFileSync(traveller, [
    "export const meta = { id: 'traveller', description: 't', severity: 'info' }",
    "export async function doctor(ctx) { ctx.files.read('../outside.ts') }",
  ].join("\n"));
  const r = await runLoader([traveller, root]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /escapes the repo root/);
});

test("ctx.search without a host channel fails loudly, never falls back unconfined", async () => {
  const root = tmpRoot();
  seed(root, { "src/x.ts": "export const a = 1\n" });
  const searcher = path.join(root, "searcher.mjs");
  fs.writeFileSync(searcher, [
    "export const meta = { id: 'searcher', description: 's', severity: 'info' }",
    "export async function doctor(ctx) { ctx.search.pattern('const $A = $B') }",
  ].join("\n"));
  const r = await runLoader([searcher, root]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ctx\.search is unavailable/);
});

test("run mode excludes test files from ctx.files.list by default", async () => {
  const root = tmpRoot();
  seed(root, {
    "src/app.ts": "export const a = 1\n",
    "src/app.test.ts": "export const b = 1\n",
    "src/ui.spec.tsx": "export const c = 1\n",
    "tests/helper.ts": "export const d = 1\n",
    "src/__tests__/nested.ts": "export const e = 1\n",
    "src/keep.ts": "export const f = 1\n",
  });
  const doctorDir = tmpRoot();
  const lister = path.join(doctorDir, "lister.mjs");
  fs.writeFileSync(lister, [
    "export const meta = { id: 'lister', description: 'lists files', severity: 'info', checks: [{ id: 'listed', description: 'lists', claim: 'a file is listed', lookalikes: ['nothing'] }] }",
    "export async function doctor(ctx) {",
    "  for (const f of ctx.files.list()) {",
    "    ctx.report.finding({ rule: 'listed', file: f, line: 1 });",
    "  }",
    "}",
  ].join("\n"));
  const r = await runLoader([lister, root]);
  assert.equal(r.status, 0);
  const line = r.stdout.split("\n").find(l => l.startsWith(SENTINEL));
  const parsed = JSON.parse(line.slice(SENTINEL.length));
  const files = parsed.findings.map(f => f.file).sort();
  assert.deepEqual(files, ["src/app.ts", "src/keep.ts"]);
  assert.equal(parsed.fileCount, 2);
});

test("run mode --include-tests lists test files", async () => {
  const root = tmpRoot();
  seed(root, {
    "src/app.ts": "export const a = 1\n",
    "src/app.test.ts": "export const b = 1\n",
    "tests/helper.ts": "export const d = 1\n",
  });
  const doctorDir = tmpRoot();
  const lister = path.join(doctorDir, "lister.mjs");
  fs.writeFileSync(lister, [
    "export const meta = { id: 'lister', description: 'lists files', severity: 'info', checks: [{ id: 'listed', description: 'lists', claim: 'a file is listed', lookalikes: ['nothing'] }] }",
    "export async function doctor(ctx) {",
    "  for (const f of ctx.files.list()) {",
    "    ctx.report.finding({ rule: 'listed', file: f, line: 1 });",
    "  }",
    "}",
  ].join("\n"));
  const r = await runLoader([lister, root, "--include-tests"]);
  assert.equal(r.status, 0);
  const line = r.stdout.split("\n").find(l => l.startsWith(SENTINEL));
  const parsed = JSON.parse(line.slice(SENTINEL.length));
  const files = parsed.findings.map(f => f.file).sort();
  assert.deepEqual(files, ["src/app.test.ts", "src/app.ts", "tests/helper.ts"]);
});

test("verify refuses a check without a claim — the contract is the gate", async () => {
  const root = tmpRoot();
  const doctor = path.join(root, "claimless.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'claimless', description: 'x', severity: 'info',",
    "  checks: [{ id: 'vague', description: 'bad code detected' }] }",
    "export async function doctor(ctx) {}",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "claimless.fixtures.mjs"), "export const fixtures = []");
  try {
    const r = await runLoader([doctor, "--verify", path.join(root, "claimless.fixtures.mjs")]);
    assert.equal(r.status, 3, "contract violation exits 3");
    assert.match(r.stderr, /claim is required/);
    assert.match(r.stderr, /observable condition/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("verify refuses a needs-declaring check without onUnknown", async () => {
  const root = tmpRoot();
  const doctor = path.join(root, "no-unknown.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'no-unknown', description: 'x', severity: 'info',",
    "  checks: [{ id: 'needsy', description: 'd', claim: 'c', lookalikes: ['l'], needs: ['bindings'] }] }",
    "export async function doctor(ctx) {}",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "no-unknown.fixtures.mjs"), "export const fixtures = []");
  try {
    const r = await runLoader([doctor, "--verify", path.join(root, "no-unknown.fixtures.mjs")]);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /onUnknown is required/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("duplicate-location probe passes a doctor that reports per violation", async () => {
  const root = tmpRoot();
  const doctor = path.join(root, "perSite.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'perSite', description: 'flags TODO comments', severity: 'info',",
    "  checks: [{ id: 'todo', description: 'TODO found', claim: 'a TODO comment is present', lookalikes: ['the word todorok'] }] }",
    "export async function doctor(ctx) {",
    "  for (const f of ctx.files.list()) {",
    "    const lines = ctx.files.read(f).split('\\n');",
    "    lines.forEach((l, i) => { if (l.includes('// TODO')) ctx.report.finding({ rule: 'todo', file: f, line: i + 1 }) });",
    "  }",
    "}",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "perSite.fixtures.mjs"), [
    "export const fixtures = [",
    "  { name: 'flagged', seed: { 'src/a.ts': 'const a = 1; // TODO fix\\n' }, expected: [{ rule: 'todo', file: 'src/a.ts', line: 1 }] },",
    "];",
  ].join("\n"));
  try {
    const r = await runLoader([doctor, "--verify", path.join(root, "perSite.fixtures.mjs")]);
    assert.equal(r.status, 0);
    const frame = r.stdout.split("\n").find(l => l.startsWith(SENTINEL));
    const parsed = JSON.parse(frame.slice(SENTINEL.length));
    const probe = parsed.results.find(x => x.name.startsWith("duplicate-location sensitivity"));
    assert.ok(probe, "probe row present");
    assert.equal(probe.ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("duplicate-location probe fails a doctor that dedups by statement text", async () => {
  const root = tmpRoot();
  const doctor = path.join(root, "deduping.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'deduping', description: 'flags TODO comments, once per unique text', severity: 'info',",
    "  checks: [{ id: 'todo', description: 'TODO found', claim: 'a TODO comment is present', lookalikes: ['the word todorok'] }] }",
    "export async function doctor(ctx) {",
    "  const seen = new Set();",
    "  for (const f of ctx.files.list()) {",
    "    const lines = ctx.files.read(f).split('\\n');",
    "    lines.forEach((l, i) => {",
    "      const norm = l.trim();",
    "      if (l.includes('// TODO') && !seen.has(norm)) { seen.add(norm); ctx.report.finding({ rule: 'todo', file: f, line: i + 1 }) }",
    "    });",
    "  }",
    "}",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "deduping.fixtures.mjs"), [
    "export const fixtures = [",
    "  { name: 'flagged', seed: { 'src/a.ts': 'const a = 1; // TODO fix\\n' }, expected: [{ rule: 'todo', file: 'src/a.ts', line: 1 }] },",
    "];",
  ].join("\n"));
  try {
    const r = await runLoader([doctor, "--verify", path.join(root, "deduping.fixtures.mjs")]);
    assert.equal(r.status, 0);
    const frame = r.stdout.split("\n").find(l => l.startsWith(SENTINEL));
    const parsed = JSON.parse(frame.slice(SENTINEL.length));
    const probe = parsed.results.find(x => x.name.startsWith("duplicate-location sensitivity"));
    assert.ok(probe);
    assert.equal(probe.ok, false);
    assert.match(probe.error, /dedup keyed on statement text|different locations/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sensitivity corpus runs only cases the doctor has expectations for", async () => {
  const root = tmpRoot();
  const doctor = path.join(root, "staked.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'sensitivity-test-stake', description: 'flags rateLimit files', severity: 'info',",
    "  checks: [{ id: 'rate', description: 'rate limiter found', claim: 'a rate limiter is present', lookalikes: ['rate-limiting in tests'] }] }",
    "export async function doctor(ctx) {",
    "  for (const f of ctx.files.list()) {",
    "    if (ctx.files.read(f).includes('rateLimiter')) ctx.report.finding({ rule: 'rate', file: f, line: 1 });",
    "  }",
    "}",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "staked.fixtures.mjs"), "export const fixtures = []");
  // The loader reads the corpus from its own package dir; this test doctor has
  // an expectation in fixtures/sensitivity/test-stake/ (shipped with the repo).
  try {
    const r = await runLoader([doctor, "--verify", path.join(root, "staked.fixtures.mjs")]);
    assert.equal(r.status, 0);
    const frame = r.stdout.split("\n").find(l => l.startsWith(SENTINEL));
    const parsed = JSON.parse(frame.slice(SENTINEL.length));
    const row = parsed.results.find(x => x.name === "sensitivity: test-stake");
    assert.ok(row, "staked case runs");
    assert.equal(row.ok, true);
    const unstaked = parsed.results.filter(x => x.name.startsWith("sensitivity:") && x.name !== "sensitivity: test-stake");
    assert.equal(unstaked.length, 0, "cases without stakes for this doctor are silent");
    assert.ok(!parsed.results.some(x => x.name.startsWith("duplicate-location")), "no flag-shaped fixture, no probe");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
