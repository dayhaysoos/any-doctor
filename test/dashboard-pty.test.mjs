import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// End-to-end regression for the interactive review browser, driven through a
// real PTY. Node has no built-in PTY, and macOS script(1) refuses to run with
// piped stdio, so we use expect(1) as the PTY provider — no npm dependencies.
// Reproduces the reported flow: select a doctor from the picker, scroll
// instances in the dashboard, copy issue context, quit with q.
// The original bug: the process exited 0 right after the enter that selected
// the doctor, so the dashboard rendered exactly one frame and died.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECT = "/usr/bin/expect";
const canRun = process.platform === "darwin" && fs.existsSync(EXPECT);

// Stage markers the expect script prints so the transcript can be segmented.
const EXPECT_SCRIPT = `
set timeout 30
spawn -noecho $env(NODE_BIN) bin/cli.js run fixtures/sample-app
expect {
  "Select a doctor" {}
  timeout { puts ">FAIL picker-timeout"; exit 101 }
  eof { puts ">FAIL picker-eof"; exit 102 }
}
send "\\r"
expect {
  "enter copy issue context" {}
  timeout { puts ">FAIL dashboard-timeout"; exit 103 }
  eof { puts ">FAIL dashboard-eof"; exit 104 }
}
puts ">STAGE pre-arrow"
send "\\x1b\\[B"
after 400
puts ">STAGE post-arrow"
send "\\r"
expect {
  "copied issue context" {}
  timeout { puts ">FAIL copy-timeout"; exit 105 }
  eof { puts ">FAIL copy-eof"; exit 106 }
}
send "q"
expect {
  eof {}
  timeout { puts ">FAIL quit-timeout"; exit 107 }
}
catch wait result
set code [lindex $result 3]
if { $code != 0 } { puts ">FAIL cli-exit-$code"; exit 108 }
puts ">STAGE done"
exit 0
`;

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

function selectionLines(text) {
  return stripAnsi(text).split("\n").filter(l => l.includes("›")).join("\n");
}

test("picker -> dashboard survives enter, scrolls, copies, quits", { skip: canRun ? false : "requires macOS expect(1) for a PTY" }, async () => {
  const child = spawn(EXPECT, ["-c", EXPECT_SCRIPT], {
    cwd: REPO,
    env: { ...process.env, NODE_BIN: process.execPath, TERM: "xterm-256color" },
  });
  let transcript = "";
  let closed = null;
  child.stdout.on("data", (c) => { transcript += c.toString("utf8"); });
  child.stderr.on("data", (c) => { transcript += c.toString("utf8"); });
  child.on("error", (e) => { closed = e; });
  child.on("close", (code) => { closed = code; });

  const done = new Promise((resolve) => child.on("close", () => resolve()));
  await done;

  assert.equal(closed, 0, `expect driver should pass cleanly (exit=${closed}):\n${stripAnsi(transcript).slice(-800)}`);

  // Reaching the copy notice proves the process survived the enter that
  // selected the doctor AND the enter inside the dashboard.
  const text = stripAnsi(transcript);
  assert.ok(text.includes("Select a doctor"), "picker frame in transcript");
  assert.ok(text.includes("enter copy issue context"), "dashboard footer in transcript");
  assert.ok(text.includes("copied issue context"), "copy notice in transcript");

  // Anti-jitter: after the dashboard's first paint (the one containing the
  // footer marker), repaints are in-place — no further full-screen erases.
  const firstDash = transcript.indexOf("enter copy issue context");
  assert.equal(transcript.indexOf("\x1b[2J", firstDash + 1), -1,
    "no full-screen erase after the dashboard's first paint");

  // Down arrow moved the selection to another instance.
  const preArrow = text.slice(text.indexOf(">STAGE pre-arrow"), text.indexOf(">STAGE post-arrow"));
  const postArrow = text.slice(text.indexOf(">STAGE post-arrow"));
  assert.notEqual(selectionLines(postArrow), selectionLines(preArrow),
    "down arrow should move the selection marker to the next instance");
});
