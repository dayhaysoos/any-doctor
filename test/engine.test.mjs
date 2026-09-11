import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

// The engine ships with the package (@ast-grep/cli's platform binary via
// npm optionalDependencies). A user installs nothing — pinned by running
// the real engine with ast-grep absent from PATH entirely.

const { runEngine, resolveAstGrepBinary, pickNativeBinary } = await import("../bin/engine.js");

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

test("engine: a #!-shim never shadows the native platform binary (--ignore-scripts layout)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-shim-"));
  try {
    // The --ignore-scripts layout: the postinstall never ran, so
    // @ast-grep/cli's bin file is still a node shim; only the platform
    // package holds the native binary.
    const shim = path.join(dir, "ast-grep");
    fs.writeFileSync(shim, "#!/usr/bin/env node\n// postinstall never replaced me\n");
    fs.chmodSync(shim, 0o755);
    const platformDir = fs.readdirSync(path.join(REPO, "node_modules", "@ast-grep"))
      .find((d) => d.startsWith("cli-"));
    assert.ok(platformDir, "a platform package is installed in this repo");
    const native = path.join(dir, "native");
    fs.copyFileSync(path.join(REPO, "node_modules", "@ast-grep", platformDir, "ast-grep"), native);
    fs.chmodSync(native, 0o755);

    assert.equal(pickNativeBinary([shim, native]), native,
      "the shim is skipped, the native binary wins — even offered second");
    assert.equal(pickNativeBinary([shim]), null,
      "a shim alone is refused: never spawn a node-dependent script as the engine");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
