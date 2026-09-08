import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// The one thing only a real terminal can prove: a bare run with a
// malicious doctor present opens the dashboard straight away — no flash, no
// prompt — with the skip note in its header, and a skip still fails the
// command. Everything else about the gate is covered by direct tests
// (capabilities, report copy, dashboard frame, cli main(argv)).

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECT = "/usr/bin/expect";
const canRun = process.platform === "darwin" && fs.existsSync(EXPECT);

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

function runExpect(script, cwd) {
  return new Promise((resolve) => {
    const child = spawn(EXPECT, ["-c", script], { cwd });
    let transcript = "";
    child.stdout.on("data", (c) => { transcript += c.toString("utf8"); });
    child.on("close", (code) => resolve({ code, transcript }));
  });
}

test("capability gate: bare run in a real terminal — dashboard opens with the skip note, no prompt",
  { skip: canRun ? false : "requires macOS expect(1) for a PTY" }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-pty-"));
  const marker = path.join(root, "marker.txt");
  fs.mkdirSync(path.join(root, "doctors"));
  fs.mkdirSync(path.join(root, "target"));
  fs.writeFileSync(path.join(root, "target", "a.ts"), "const a = 1\n");
  fs.writeFileSync(path.join(root, "doctors", "innocent.mjs"), [
    "export const meta = { id: 'innocent', description: 'flags a const', severity: 'info' }",
    "export async function doctor(ctx) {",
    "  for (const file of ctx.files.list()) {",
    '    if (ctx.files.read(file).includes("const a = 1")) ctx.report.finding({ file, line: 1 });',
    "  }",
    "}",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "doctors", "evil.mjs"), [
    'import fs from "node:fs";',
    "export const meta = { id: 'evil', description: 'e', severity: 'info' }",
    `export async function doctor(ctx) { fs.writeFileSync(${JSON.stringify(marker)}, "ran"); }`,
  ].join("\n"));

  try {
    const bare = await runExpect([
      "set timeout 20",
      `spawn node ${REPO}/bin/cli.js run`,
      "expect {",
      '  "space select" {}',
      '  timeout { puts ">FAIL selector-timeout"; exit 105 }',
      "}",
      'send "\\r"',
      "expect {",
      '  "skipped: evil" {}',
      '  timeout { puts ">FAIL note-timeout"; exit 103 }',
      "}",
      "expect {",
      '  "enter copy finding" {}',
      '  timeout { puts ">FAIL dashboard-timeout"; exit 104 }',
      "}",
      'send "q"',
      "expect eof",
      "catch { lassign [wait] _ _ _ status }",
      'puts "EXIT=$status"',
    ].join("\n"), root);
    const noted = stripAnsi(bare.transcript);
    assert.ok(noted.includes("could be malicious"), "the dashboard note names it");
    assert.ok(!noted.includes("Run anyway"), "no prompt exists in any mode");
    assert.match(noted, /EXIT=1/, "a skip still fails the run");
    assert.ok(!fs.existsSync(marker), "the unsafe doctor never executed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
