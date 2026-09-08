import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// The sdk's rule-query validation is the agent guardrail (D20 Stage 1):
// it runs BEFORE the host is asked, so every case below needs no search
// host on the channel — validation throws first.

const { buildCtx } = await import("../bin/sdk.js");

const ctx = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-sdk-"));
  return { dir, ctx: buildCtx(dir).ctx };
};

test("ctx.search.rule: an unknown key is refused with the allowed list and a typo suggestion", () => {
  const { ctx: c, dir } = ctx();
  try {
    assert.throws(() => c.search.rule({ pattern: "fetch($$$A)", insdie: { pattern: "useEffect($$$B)" } }), /unknown key "insdie" — did you mean "inside"\? — allowed: pattern, inside/);
    assert.throws(() => c.search.rule({ pattern: "x", kind: "call" }), /unknown key "kind" — allowed: pattern, inside/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ctx.search.rule: pattern is required and must be a non-empty string", () => {
  const { ctx: c, dir } = ctx();
  try {
    assert.throws(() => c.search.rule({}), /needs a "pattern" string/);
    assert.throws(() => c.search.rule({ pattern: 42 }), /needs a "pattern" string/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ctx.search.rule: inside needs its own pattern; stopBy is validated", () => {
  const { ctx: c, dir } = ctx();
  try {
    assert.throws(() => c.search.rule({ pattern: "x", inside: { stopBy: "end" } }), /"inside" needs a "pattern" string/);
    assert.throws(() => c.search.rule({ pattern: "x", inside: { pattern: "y", stopBy: "middle" } }), /stopBy" must be "end" or "neighbor" — got "middle"/);
    assert.throws(() => c.search.rule({ pattern: "x", inside: "useEffect($$$B)" }), /"inside" must be an object/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
