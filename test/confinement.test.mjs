import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "url";

// Direct seams for the confinement choreography — previously provable only
// end-to-end through real doctor children. confineProcess installs a
// process-global resolve hook, so its tests run in child probes: the guard
// vetoes Node's own lazy imports too, and the test runner must not live
// under it.

const LOADER = fileURLToPath(new URL("../bin/doctor-loader.mjs", import.meta.url));

function probe(body) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", body], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

test("confineProcess: the network globals are gone before any doctor code runs", () => {
  const r = probe(`
    const { confineProcess } = await import(${JSON.stringify(LOADER)});
    confineProcess();
    console.log(typeof globalThis.fetch, typeof globalThis.WebSocket);
  `);
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, "undefined undefined");
});

test("confineProcess: after registration, every import is refused — including the probe's own", () => {
  const r = probe(`
    const { confineProcess } = await import(${JSON.stringify(LOADER)});
    confineProcess();
    try { await import("node:fs"); console.log("IMPORTED"); }
    catch (e) { console.log(e.message.includes("single self-contained file") ? "REFUSED" : "OTHER " + e.message); }
  `);
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, "REFUSED");
});

// The runtime-denial mapper decides what the refusal line names for an
// evading doctor; Node's phrasings vary across versions. Pure functions —
// tested in-process.
const { deniedByPermissionModel, denialCapability } = await import("../bin/runner.js");

test("denial mapper: Node's denial phrasings are recognized across versions", () => {
  assert.ok(deniedByPermissionModel("Error [ErrAccessDenied]: The operation was not allowed"));
  assert.ok(deniedByPermissionModel("Error: Access to this API has been restricted. Use --allow-fs-write to manage permissions."));
  assert.ok(deniedByPermissionModel("something went wrong: not allowed by the permission model"));
  assert.equal(deniedByPermissionModel("SyntaxError: unexpected token"), false);
});

test("denial mapper: the refusal names the capability the flag hints at", () => {
  assert.equal(denialCapability("Use --allow-fs-write to manage permissions."), "file write");
  assert.equal(denialCapability("Use --allow-child-process to manage permissions."), "subprocess");
  assert.equal(denialCapability("Use --allow-worker to manage permissions."), "worker");
  assert.equal(denialCapability("Use --allow-addon to manage permissions."), "native addon");
  assert.equal(denialCapability("no hint at all"), "forbidden capability");
});
