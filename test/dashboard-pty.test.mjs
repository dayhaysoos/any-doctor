import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// End-to-end regression for the interactive review browser, driven through a
// real PTY. Node has no built-in PTY, and macOS script(1) refuses to run with
// piped stdio, so we use expect(1) as the PTY provider — no npm dependencies.
// The product flow under test: a bare `run` shows the AGGREGATE tree first —
// no doctor picker — with the worst doctor open; enter walks doctor ->
// check -> finding; enter on an finding copies its context; q quits.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECT = "/usr/bin/expect";
const canRun = process.platform === "darwin" && fs.existsSync(EXPECT);

// Stage markers the expect script prints so the transcript can be segmented.
const EXPECT_SCRIPT = `
set timeout 30
spawn -noecho $env(NODE_BIN) bin/cli.js run fixtures/sample-app
expect {
  "space select" {}
  timeout { puts ">FAIL selector-timeout"; exit 112 }
  eof { puts ">FAIL selector-eof"; exit 113 }
}
send "a\\r"
expect {
  "async" {}
  timeout { puts ">FAIL dashboard-timeout"; exit 103 }
  eof { puts ">FAIL dashboard-eof"; exit 104 }
}
expect {
  "a accept" {}
  timeout { puts ">FAIL footer-timeout"; exit 110 }
  eof { puts ">FAIL footer-eof"; exit 111 }
}
# selection starts on the async row (top, expanded): down onto its
# first check, then enter expands the check
send "\\x1b\\[B"
after 300
puts ">STAGE pre-expand"
send "\\r"
expect {
  ".ts:" {}
  timeout { puts ">FAIL expand-timeout"; exit 108 }
  eof { puts ">FAIL expand-eof"; exit 109 }
}
after 200
puts ">STAGE expanded"
send "\\x1b\\[B"
after 300
puts ">STAGE on-finding"
send "\\r"
expect {
  "copied finding" {}
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

test("bare run opens the aggregate tree directly; enter walks doctor-check-finding and copies", { skip: canRun ? false : "requires macOS expect(1) for a PTY" }, async () => {
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

  const text = stripAnsi(transcript);
  assert.ok(text.includes("Select doctors to run"), "the cohort selector is the first screen");
  assert.ok(text.includes("async"), "the aggregate tree follows one Enter");
  assert.ok(text.includes("async"), "the aggregate tree is the first screen");
  assert.ok(text.includes("a accept"), "dashboard footer in transcript");
  assert.ok(text.includes("copied finding"), "copy notice in transcript");

  // Anti-jitter: after the dashboard's first paint (the one containing the
  // footer marker), repaints are in-place — no further full-screen erases.
  const firstDash = transcript.indexOf("a accept");
  assert.equal(transcript.indexOf("\x1b[2J", firstDash + 1), -1,
    "no full-screen erase after the dashboard's first paint");

  // The tree: the first enter expanded the top check (findings visible),
  // down moved onto an finding, and enter there copied its context.
  assert.ok(text.includes("\u00d74"), "the async doctor row carries its total count");
  const counts = text.match(/\u00d7\d/g) ?? [];
  assert.ok(counts.length >= 2, "check rows carry finding counts");
  const beforeExpand = text.slice(0, text.indexOf(">STAGE pre-expand"));
  assert.ok(!/src\/[^\s:]+\.ts:\d/.test(beforeExpand), "findings hidden until the check expands");
  assert.ok(/src\/[^\s:]+\.ts:\d/.test(text.slice(text.indexOf(">STAGE expanded"))), "expansion reveals findings");
});
