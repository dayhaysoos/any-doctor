import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));

test("exports map: runtime entry matches the types entry, and both exist", () => {
  const dot = pkg.exports["."];
  assert.equal(dot.types, pkg.types);
  assert.equal(dot.default, "./bin/contract.js");
  assert.ok(fs.existsSync(path.join(REPO, dot.types)));
  assert.ok(fs.existsSync(path.join(REPO, dot.default)));
});

test("importing the package entry yields the contract, side-effect-free", async () => {
  const m = await import("../bin/contract.js");
  assert.equal(typeof m.resolveFinding, "function");
  assert.equal(typeof m.compareFindings, "function");
});

test("shipped bin: no orphaned declarations", () => {
  const bin = path.join(REPO, "bin");
  for (const f of fs.readdirSync(bin)) {
    if (f.endsWith(".d.ts")) {
      assert.ok(fs.existsSync(path.join(bin, f.replace(/\.d\.ts$/, ".js"))), f + " has no runtime sibling");
    }
  }
});
