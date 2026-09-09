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

test("ctx.search.rules: validation — array with unique non-empty ids, same curation as rule", () => {
  const { ctx: c, dir } = ctx();
  try {
    assert.throws(() => c.search.rules([]), /non-empty array of named rules/);
    assert.throws(() => c.search.rules("x"), /non-empty array of named rules/);
    assert.throws(() => c.search.rules([{ pattern: "x" }]), /needs an "id" string/);
    assert.throws(() => c.search.rules([{ id: "a", pattern: "x" }, { id: "a", pattern: "y" }]), /duplicate id "a"/);
    assert.throws(() => c.search.rules([{ id: "a", pattern: "x", insdie: {} }]), /unknown key "insdie" — did you mean "inside"\?/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ctx.analysis: forced-off (verify's degraded fixtures) makes available false and bindings loud", async () => {
  const { setAnalysisDisabled, probeAnalysisAvailable } = await import("../bin/sdk.js");
  const { ctx: c, dir } = ctx();
  try {
    setAnalysisDisabled(true);
    try {
      // no host channel here: available answers false honestly (the
      // narrowing decision), while bindings() fails loudly like search
      assert.equal(c.analysis.available, false);
      assert.equal(probeAnalysisAvailable(dir), false);
      assert.throws(() => c.analysis.bindings("a.ts"), /requires the analysis engine/);
    } finally {
      setAnalysisDisabled(false);
    }
    // restored: no host means still-false availability, but the switch is off
    assert.equal(probeAnalysisAvailable(dir), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ctx.files.readMasked: comments and strings blanked, offsets and length preserved", () => {
  const { ctx: c, dir } = ctx();
  try {
    const source = [
      "const a = 1; // trailing comment",
      "const s = 'string with // and /* inside';",
      "/* block",
      "comment */ const t = `template ${x}`;",
      "const real = fetch(url);",
    ].join("\n");
    fs.writeFileSync(path.join(dir, "m.ts"), source);
    const masked = c.files.readMasked("m.ts");
    assert.equal(masked.length, source.length, "length preserved");
    for (let i = 0; i < source.length; i += 1) {
      assert.equal(masked[i] === "\n", source[i] === "\n", `newline positions identical at ${i}`);
    }
    assert.ok(!masked.includes("//"), "line comments masked");
    assert.ok(!masked.includes("string with"), "string literals masked");
    assert.ok(!masked.includes("block"), "block comments masked");
    assert.ok(!masked.includes("template"), "template literals masked");
    assert.match(masked, /const real = fetch\(url\);/, "code survives");
    // the invariant doctors rely on: a raw-source index addresses the
    // same char in the masked text
    const fetchAt = source.indexOf("fetch");
    assert.equal(masked[fetchAt], "f", "offsets address the same char");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
