import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// The engine ships with the package (@ast-grep/cli's platform binary via
// npm optionalDependencies). A user installs nothing — pinned by running
// the real engine with ast-grep absent from PATH entirely.

const { runEngine, resolveAstGrepBinary } = await import("../bin/engine.js");

test("engine: the bundled binary resolves without PATH", () => {
  const binary = resolveAstGrepBinary();
  assert.ok(binary !== null, "the @ast-grep/cli binary resolves from node_modules");
  assert.ok(fs.existsSync(binary), `the resolved path exists: ${binary}`);
});

test("engine: a real search runs with ast-grep stripped from PATH", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-engine-"));
  try {
    fs.writeFileSync(path.join(dir, "probe.ts"), 'const x = fetch("a");\n');
    const savedPath = process.env.PATH;
    process.env.PATH = "/usr/bin:/bin"; // no ast-grep, no sg, no homebrew
    try {
      const r = runEngine({ op: "pattern", pattern: "fetch($U)" }, "TypeScript", dir);
      assert.ok(r.ok, `search succeeds without PATH ast-grep: ${r.ok ? "" : r.error}`);
      assert.equal(r.matches.length, 1);
      assert.match(r.matches[0].text ?? "", /fetch\("a"\)/);
    } finally {
      process.env.PATH = savedPath;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
