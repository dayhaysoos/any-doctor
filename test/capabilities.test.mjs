import { test } from "node:test";
import assert from "node:assert/strict";
import { scanCapabilities, capabilitySummary, scanDoctorFile } from "../bin/capabilities.js";
import { supportsPermissionModel } from "../bin/runner.js";

const scan = (src) => scanCapabilities(src);

// Gated on the runner's own probe — tests and runtime can't drift.
const supportsPM = await supportsPermissionModel();
const canHooks = typeof (await import("node:module")).register === "function";

test("scanner: clean for a ctx-only doctor", () => {
  const r = scan(`
export const meta = { id: "x", description: "d", severity: "warning" };
export async function doctor(ctx) {
  for (const file of ctx.files.list()) {
    const src = ctx.files.read(file);
    if (src.includes("bad")) ctx.report.finding({ file, line: 1 });
  }
  const hits = await ctx.search.pattern("fetch($$$A)");
}`);
  assert.deepEqual(r.findings, []);
  assert.match(capabilitySummary(r), /reads via ctx only/);
});

test("scanner: red for every network shape", () => {
  const red = (src, cap) => {
    const r = scan(src);
    assert.ok(r.red.length >= 1, "at least one red: " + src.trim().slice(0, 50));
    assert.ok(r.red.every(f => f.capability === cap), "all reds are " + cap);
  };
  red(`const r = await fetch("https://x.example.com");`, "network");
  red(`import http from "node:http";\nhttp.get("http://x");`, "network");
  red(`import { get } from "https";`, "network");
  red(`const net = require("net");`, "network");
  red(`import { connect } from "node:tls";`, "network");
  red(`const w = new WebSocket("wss://x");`, "network");
});

test("scanner: red for writes and subprocesses, with line numbers", () => {
  const r = scan(`
export async function doctor(ctx) {
  fs.writeFileSync("/tmp/x", "boom");
  execSync("curl https://x.example.com");
}`);
  assert.equal(r.red.length, 2, "write + spawn are red");
  assert.equal(r.red[0].capability, "file write");
  assert.equal(r.red[0].line, 3);
  assert.equal(r.red[1].capability, "subprocess");
  assert.equal(r.red[1].line, 4);
});

test("scanner: yellow for direct fs reads and env, never red", () => {
  const r = scan(`
const src = fs.readFileSync("a.ts", "utf8");
if (process.env.DEBUG) console.error("x");
export async function doctor(ctx) {}`);
  assert.equal(r.red.length, 0);
  const caps = r.yellow.map(f => f.capability);
  assert.ok(caps.includes("direct fs read"));
  assert.ok(caps.includes("environment"));
});

test("scanner: comments and strings never trigger", () => {
  const r = scan(`
// this doctor mentions fetch( and fs.writeFileSync( and exec( in prose
const note = "we considered fetch() but a doctor must never call it";
export async function doctor(ctx) {}`);
  assert.deepEqual(r.findings, []);
});

test("scanner: a RegExp's .exec() is not a subprocess", () => {
  const r = scan(`
const re = /useEffect\\b/g;
let m;
while ((m = re.exec(source))) {
  ctx.report.finding({ file: "a", line: 1 });
}`);
  assert.equal(r.red.length, 0);
});

test("runner backstop: an unsafe doctor never executes", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { runDoctor } = await import("../bin/runner.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-"));
  const marker = path.join(dir, "marker.txt");
  const doctor = path.join(dir, "evil.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'evil', description: 'e', severity: 'info' }",
    `import fs from "node:fs";`,
    `export async function doctor(ctx) { fs.writeFileSync(${JSON.stringify(marker)}, "pwned"); }`,
  ].join("\n"));
  const target = path.join(dir, "target");
  fs.mkdirSync(target);

  await assert.rejects(
    runDoctor({ programPath: doctor, targetDir: target }),
    (e) => {
      assert.equal(e._tag, "DoctorUnsafe");
      assert.ok(e.capabilities.includes("file write"), "the capability set rides on the typed error");
      assert.match(e.findings.join("; "), /file write/);
      return true;
    },
  );
  assert.ok(!fs.existsSync(marker), "nothing executed — the marker was never written");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("metaDoctor: importing IS executing — unsafe surfaces as typed broken-doctor data", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { metaDoctor, describeRunnerError } = await import("../bin/runner.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-meta-"));
  const doctor = path.join(dir, "evil.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'evil', description: 'e', severity: 'info' }",
    `const beacon = await fetch("https://exfil.example.com");`,
    "export async function doctor(ctx) {}",
  ].join("\n"));
  const read = await metaDoctor({ programPath: doctor });
  assert.equal(read.meta, null);
  assert.equal(read.cause?._tag, "DoctorUnsafe", "the typed cause crosses intact — callers never re-scan");
  assert.ok(read.cause.capabilities.includes("network"));
  assert.match(describeRunnerError(read.cause), /not running it\./, "the cause renders as the one-line refusal");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("runtime enforcement: dynamic-import payloads are caught by the scan and refused",
  { skip: supportsPM ? false : "runtime lacks --permission" }, async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { runDoctor } = await import("../bin/runner.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-rt-"));
  const marker = path.join(dir, "marker.txt");
  const doctor = path.join(dir, "sneaky.mjs");
  // Dynamic import + method call: the shape that used to scan clean.
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'sneaky', description: 's', severity: 'info' }",
    'const cp = await import("node:child_process");',
    `export async function doctor(ctx) { cp.execSync("touch " + ${JSON.stringify(marker)}); }`,
  ].join("\n"));
  const target = path.join(dir, "target");
  fs.mkdirSync(target);

  assert.ok(scanDoctorFile(doctor).red.some(f => f.capability === "import"), "the scan now flags the import itself");
  await assert.rejects(
    runDoctor({ programPath: doctor, targetDir: target }),
    (e) => e._tag === "DoctorUnsafe",
    "refused before execution",
  );
  assert.ok(!fs.existsSync(marker), "nothing executed");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("scanner: any import in a doctor is red — doctors are single-file programs", () => {
  const staticImport = scan(`import got from "got";\nexport async function doctor(ctx) {}`);
  assert.ok(staticImport.red.some(f => f.capability === "import"), "static import");
  const sideEffect = scan(`import "./helper.mjs";\nexport async function doctor(ctx) {}`);
  assert.ok(sideEffect.red.some(f => f.capability === "import"), "side-effect import");
  const dynamic = scan(`export async function doctor(ctx) { const fs = await import("node:fs"); }`);
  assert.ok(dynamic.red.some(f => f.capability === "import"), "dynamic import");
});

test("import guard: a computed import that evades the scan is refused by the runtime",
  { skip: canHooks ? false : "runtime lacks module hooks" }, async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { runDoctor } = await import("../bin/runner.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-import-"));
  const doctor = path.join(dir, "smuggler.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'smuggler', description: 's', severity: 'info' }",
    'const dyn = (0,eval)("(x)=>import(x)");',
    `export async function doctor(ctx) { const fs2 = await dyn("node:fs"); fs2.readFileSync("/etc/hosts"); }`,
  ].join("\n"));
  const target = path.join(dir, "target");
  fs.mkdirSync(target);

  assert.equal(scanDoctorFile(doctor).red.length, 0, "payload evades the static scan — that is the point");
  await assert.rejects(
    runDoctor({ programPath: doctor, targetDir: target }),
    (e) => e._tag === "DoctorCrashed" && /single self-contained file/.test(e.detail),
    "the import guard refuses it at resolution time",
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("network globals are stripped: a smuggled fetch is not a function", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { runDoctor } = await import("../bin/runner.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-net-"));
  const doctor = path.join(dir, "phoner.mjs");
  fs.writeFileSync(doctor, [
    "export const meta = { id: 'phoner', description: 'p', severity: 'info' }",
    `export async function doctor(ctx) { const f = globalThis["fe" + "tch"]; await f("https://example.com/collect"); }`,
  ].join("\n"));
  const target = path.join(dir, "target");
  fs.mkdirSync(target);

  assert.equal(scanDoctorFile(doctor).red.length, 0, "payload evades the static scan — that is the point");
  await assert.rejects(
    runDoctor({ programPath: doctor, targetDir: target }),
    (e) => e._tag === "DoctorCrashed" && /not a function/i.test(e.detail),
    "fetch does not exist in the doctor process",
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("repo doctors all scan clean (dogfood)", async () => {
  const fs = await import("node:fs");
  for (const f of fs.readdirSync("doctors").filter(f => f.endsWith(".mjs") && !f.includes("fixtures"))) {
    const r = scanDoctorFile("doctors/" + f);
    assert.equal(r.red.length, 0, f + " should be gate-clean");
  }
});
