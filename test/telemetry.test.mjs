import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import { buildRunCount, sendRunCount, telemetryEnabled } from "../bin/telemetry.js";
import { bundledDoctorsDir } from "../bin/discover.js";
import path from "node:path";
import fs from "node:fs";

// User doctors in fixtures must NOT live under the repo's doctors/ — in
// this repo that directory IS the bundled pack, so anything in it
// classifies as bundled. Real installs separate them (node_modules).
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-user-doctors-"));

test("buildRunCount names bundled doctors, counts custom ones anonymously", () => {
  const bundled = path.join(bundledDoctorsDir(), "async.mjs");
  const userOne = path.join(userDir, "acme-rules.mjs");
  const userTwo = path.join(userDir, "internal-api.mjs");

  const payload = buildRunCount([
    { id: "async", programPath: bundled },
    { id: "acme-rules", programPath: userOne },
    { id: "internal-api", programPath: userTwo },
  ]);

  assert.ok(payload, "a run with doctors produces a payload");
  assert.equal(payload.doctors.length, 1, "only the bundled id is named");
  assert.equal(payload.doctors[0], "async");
  assert.equal(payload.custom, 2, "user doctors collapse to a count");
  assert.deepEqual(Object.keys(payload).sort(), ["custom", "doctors", "v"], "no extra fields ship");
});

test("the payload carries no name a user wrote", () => {
  const payload = buildRunCount([
    { id: "acme-secret-inc-internal", programPath: "/tmp/doctors/acme-secret-inc-internal.mjs" },
  ]);
  assert.equal(payload.custom, 1);
  assert.equal(payload.doctors.length, 0);
  const wire = JSON.stringify(payload);
  assert.ok(!wire.includes("acme"), "user doctor names never appear on the wire");
});

test("an empty run sends nothing", () => {
  assert.equal(buildRunCount([]), null);
});

test("a local shadow of a bundled name counts as custom, not bundled", () => {
  const shadow = path.join(userDir, "async.mjs");
  const payload = buildRunCount([{ id: "async", programPath: shadow }]);
  assert.deepEqual(payload.doctors, [], "the id is only safe to name when the program is the pack's");
  assert.equal(payload.custom, 1);
});

test("sendRunCount posts exactly one JSON object and reports ok", async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ method: req.method, body });
      res.writeHead(204);
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/count`;
  const prevUrl = process.env.ANY_DOCTOR_TELEMETRY_URL;
  const prevOff = process.env.ANY_DOCTOR_NO_TELEMETRY; // npm test sets it
  delete process.env.ANY_DOCTOR_NO_TELEMETRY;
  process.env.ANY_DOCTOR_TELEMETRY_URL = url;
  try {
    const ok = await sendRunCount({ v: "test", doctors: ["async"], custom: 1 });
    assert.equal(ok, true);
    assert.equal(received.length, 1, "exactly one POST");
    assert.equal(received[0].method, "POST");
    assert.deepEqual(JSON.parse(received[0].body), { v: "test", doctors: ["async"], custom: 1 });
  } finally {
    process.env.ANY_DOCTOR_TELEMETRY_URL = prevUrl;
    if (prevOff === undefined) delete process.env.ANY_DOCTOR_NO_TELEMETRY;
    else process.env.ANY_DOCTOR_NO_TELEMETRY = prevOff;
    server.close();
  }
});

test("ANY_DOCTOR_NO_TELEMETRY disables the send", async () => {
  const prev = process.env.ANY_DOCTOR_NO_TELEMETRY;
  process.env.ANY_DOCTOR_NO_TELEMETRY = "1";
  try {
    assert.equal(telemetryEnabled(), false);
    // A reachable endpoint still gets nothing when disabled.
    assert.equal(await sendRunCount({ v: "test", doctors: [], custom: 0 }), false);
  } finally {
    if (prev === undefined) delete process.env.ANY_DOCTOR_NO_TELEMETRY;
    else process.env.ANY_DOCTOR_NO_TELEMETRY = prev;
  }
});

test("an unreachable endpoint is a silent no-op", async () => {
  const prev = process.env.ANY_DOCTOR_TELEMETRY_URL;
  process.env.ANY_DOCTOR_TELEMETRY_URL = "http://127.0.0.1:1/count"; // nothing listens
  try {
    assert.equal(await sendRunCount({ v: "test", doctors: ["async"], custom: 0 }), false);
  } finally {
    process.env.ANY_DOCTOR_TELEMETRY_URL = prev;
  }
});
