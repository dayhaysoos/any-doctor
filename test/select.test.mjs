import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { selectDoctor } from "../bin/select.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCTOR = path.join(REPO, "doctors", "async.mjs");

class FakeStdin extends EventEmitter {
  isTTY;
  isRaw = false;
  rawModeHistory = [];
  resumed = 0;
  paused = 0;
  constructor(isTTY = true) { super(); this.isTTY = isTTY; }
  setRawMode(mode) { this.isRaw = mode; this.rawModeHistory.push(mode); }
  resume() { this.resumed++; }
  pause() { this.paused++; }
  send(s) { this.emit("data", Buffer.from(s, "utf8")); }
}
class FakeStdout {
  isTTY;
  constructor(isTTY = true) { this.isTTY = isTTY; }
  frames = [];
  write(s) { this.frames.push(s); }
}

function emptyGlobalDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-select-global-"));
}

function settle(promise) {
  return Promise.race([
    promise.then((v) => ({ done: true, value: v }), (e) => ({ done: true, error: e })),
    new Promise((r) => setTimeout(() => r({ done: false }), 3000)),
  ]);
}

test("selectDoctor: explicit path resolves directly, no discovery", async () => {
  const sel = await selectDoctor(DOCTOR, {
    cwd: os.tmpdir(),
    useColor: false,
    env: { stdin: new FakeStdin(false), stdout: new FakeStdout(false) },
  });
  assert.equal(sel.kind, "doctor");
  assert.equal(sel.doctorPath, DOCTOR);
  assert.deepEqual(sel.skipped, []);
});

test("selectDoctor: slug.mjs argument resolves via the repo scope", async () => {
  const sel = await selectDoctor("async.mjs", {
    cwd: REPO,
    useColor: false,
    env: { stdin: new FakeStdin(false), stdout: new FakeStdout(false) },
  });
  assert.equal(sel.kind, "doctor");
  assert.equal(sel.doctorPath, DOCTOR);
});

test("selectDoctor: unresolvable argument is not-found", async () => {
  const sel = await selectDoctor("nope.mjs", {
    cwd: REPO,
    useColor: false,
    env: { stdin: new FakeStdin(false), stdout: new FakeStdout(false) },
  });
  assert.deepEqual(sel, { kind: "not-found", arg: "nope.mjs" });
});

test("selectDoctor: non-interactive session yields listing rows, not a picker", async () => {
  const sel = await selectDoctor(undefined, {
    cwd: REPO,
    globalDir: emptyGlobalDir(),
    bundledDir: emptyGlobalDir(),
    useColor: false,
    env: { stdin: new FakeStdin(false), stdout: new FakeStdout(false) },
  });
  assert.equal(sel.kind, "non-interactive");
  assert.ok(sel.rows.length >= 4, "repo doctors listed");
  const row = sel.rows.find(r => r.slug === "async");
  assert.ok(row, "known doctor present");
  assert.equal(row.scope, "repo");
});

test("selectDoctor: enter on the picker yields the top doctor", async () => {
  const stdin = new FakeStdin(true);
  const stdout = new FakeStdout(true);
  const done = selectDoctor(undefined, {
    cwd: REPO,
    globalDir: emptyGlobalDir(),
    bundledDir: emptyGlobalDir(),
    useColor: false,
    env: { stdin, stdout },
  });
  const deadline = Date.now() + 5000;
  while (stdout.frames.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  stdin.send("\r");
  const out = await settle(done);
  assert.ok(out.done, "picker resolves");
  assert.equal(out.value.kind, "doctor");
  assert.ok(out.value.doctorPath.endsWith("async.mjs"), "alphabetically first valid doctor");
});

test("selectDoctor: esc during the pick is cancelled, distinct from non-interactive", async () => {
  const stdin = new FakeStdin(true);
  const stdout = new FakeStdout(true);
  const done = selectDoctor(undefined, {
    cwd: REPO,
    globalDir: emptyGlobalDir(),
    bundledDir: emptyGlobalDir(),
    useColor: false,
    env: { stdin, stdout },
  });
  const deadline = Date.now() + 5000;
  while (stdout.frames.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  stdin.send("\x1b");
  const out = await settle(done);
  assert.ok(out.done);
  assert.deepEqual(out.value, { kind: "cancelled" });
});

test("selectDoctor: no valid doctors is none-discovered with the broken list", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-select-"));
  fs.mkdirSync(path.join(root, "doctors"));
  fs.writeFileSync(path.join(root, "doctors", "broken.mjs"), "export async function doctor(ctx) {}");
  const sel = await selectDoctor(undefined, {
    cwd: root,
    globalDir: emptyGlobalDir(),
    bundledDir: emptyGlobalDir(),
    useColor: false,
    env: { stdin: new FakeStdin(false), stdout: new FakeStdout(false) },
  });
  assert.equal(sel.kind, "none-discovered");
  assert.equal(sel.broken.length, 1);
  assert.equal(sel.broken[0].slug, "broken");
  fs.rmSync(root, { recursive: true, force: true });
});

test("selectDoctor: allowPicker=false forces the non-interactive listing even on a terminal", async () => {
  const sel = await selectDoctor(undefined, {
    cwd: REPO,
    globalDir: emptyGlobalDir(),
    bundledDir: emptyGlobalDir(),
    useColor: false,
    allowPicker: false,
    env: { stdin: new FakeStdin(true), stdout: new FakeStdout(true) },
  });
  assert.equal(sel.kind, "non-interactive");
  assert.ok(sel.rows.length >= 4);
});
