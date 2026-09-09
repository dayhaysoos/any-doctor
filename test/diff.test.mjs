import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// runDiff crosses the real seam: a real temp git repository, the real
// cohort behind the base scan, and the verify gate's own multiset doing
// the comparison. The marker doctor flags files containing BAD (line 1,
// warning severity) and crashes on files containing CRASH —
// content-addressable findings make base/head states easy to compose
// precisely. The doctor lives OUTSIDE the scanned target: its own
// source contains both trigger words.

const { runCohort } = await import("../bin/cohort.js");
const { deriveSummary } = await import("../bin/summary.js");
const { runDiff } = await import("../bin/diff.js");

const hasGit = spawnSync("git", ["--version"]).status === 0;
const gitSkip = hasGit ? false : "git not on PATH";

const MARKER_DOCTOR = [
  "export const meta = { id: 'marker', description: 'flags BAD files', severity: 'warning' }",
  "export async function doctor(ctx) {",
  "  for (const file of ctx.files.list()) {",
  "    const src = ctx.files.read(file)",
  '    if (src.includes("CRASH")) throw new Error("base-boom")',
  '    if (src.includes("BAD")) ctx.report.finding({ file, line: 1 })',
  "  }",
  "}",
].join("\n");

function git(dir, args) {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return String(r.stdout).trim();
}

// The repo and the doctor are separate temp dirs: the doctor's own
// source must never be scan surface.
function setup() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-diff-"));
  const doctorDir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-doctor-"));
  const doctor = path.join(doctorDir, "marker.mjs");
  fs.writeFileSync(doctor, MARKER_DOCTOR);
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "test@any-doctor"]);
  git(repo, ["config", "user.name", "any-doctor test"]);
  return { repo, doctor, cleanup: () => { fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(doctorDir, { recursive: true, force: true }); } };
}

function write(repo, name, mode) {
  const content = mode === "bad" ? "const BAD = 1\n" : mode === "crash" ? "const CRASH = 1\n" : "const ok = 1\n";
  fs.writeFileSync(path.join(repo, name), content);
}

function specOf(repo, doctor) {
  return { doctors: [{ id: "marker", programPath: doctor }], targetDir: repo, includeTests: false };
}

async function headGroups(repo, doctor) {
  const ran = await runCohort(specOf(repo, doctor));
  assert.deepEqual(ran.crashed, [], "the HEAD scan is healthy in these fixtures");
  return deriveSummary(ran).groups;
}

test("diff: added and resolved against the merge base — never against main's tip", { skip: gitSkip }, async () => {
  const { repo, doctor, cleanup } = setup();
  try {
    write(repo, "a.ts", "bad");
    write(repo, "b.ts", "ok");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "base"]);
    // Branch; main gains an EXTRA finding after the branch point — the
    // diff must judge the merge base, not main's tip.
    git(repo, ["checkout", "-b", "feat"]);
    git(repo, ["checkout", "main"]);
    write(repo, "d.ts", "bad");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "main moved on"]);
    git(repo, ["checkout", "feat"]);
    // The change: a.ts fixed, b.ts newly bad, c.ts invented bad.
    write(repo, "a.ts", "ok");
    write(repo, "b.ts", "bad");
    write(repo, "c.ts", "bad");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "the change"]);

    const groups = await headGroups(repo, doctor);
    assert.deepEqual(groups[0].findings.map(f => f.file).sort(), ["b.ts", "c.ts"], "HEAD sees b and c");
    const d = await runDiff(specOf(repo, doctor), "main", groups);
    assert.deepEqual(d.added.map(a => a.file).sort(), ["b.ts", "c.ts"], "added: what the change introduced");
    assert.deepEqual(d.resolved.map(r => r.file), ["a.ts"], "resolved: what it fixed");
    assert.ok(!JSON.stringify(d).includes("d.ts"), "main's post-branch finding is nobody's baseline");
    assert.match(d.base, /main/);
    assert.match(d.baseSha, /^[0-9a-f]{40}$/);
    assert.equal(d.added[0].severity, "warning", "added findings carry severities for the gate");
    assert.equal(d.added[0].doctorId, "marker");
  } finally {
    cleanup();
  }
});

test("diff: a target subpath absent at base is an honestly empty baseline", { skip: gitSkip }, async () => {
  const { repo, doctor, cleanup } = setup();
  try {
    git(repo, ["commit", "--allow-empty", "-m", "base: no sub/ yet"]);
    git(repo, ["checkout", "-b", "feat"]);
    fs.mkdirSync(path.join(repo, "sub"));
    write(repo, path.join("sub", "x.ts"), "bad");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "invent sub/"]);

    const s = { ...specOf(repo, doctor), targetDir: path.join(repo, "sub") };
    const groups = await headGroups(s.targetDir, doctor);
    const d = await runDiff(s, "main", groups);
    assert.deepEqual(d.added.map(a => a.file), ["x.ts"], "everything in the invented directory is added");
    assert.deepEqual(d.resolved, []);
  } finally {
    cleanup();
  }
});

test("diff: a partial base never gates — a base crash aborts loudly", { skip: gitSkip }, async () => {
  const { repo, doctor, cleanup } = setup();
  try {
    write(repo, "boom.ts", "crash");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "base has the crash trigger"]);
    git(repo, ["checkout", "-b", "feat"]);
    write(repo, "boom.ts", "ok");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "HEAD removed it"]);

    const groups = await headGroups(repo, doctor);
    await assert.rejects(
      () => runDiff(specOf(repo, doctor), "main", groups),
      /--base aborted: the base scan crashed \(marker\).*would dress pre-existing findings up as added/s,
      "the abort names the doctor and the reason",
    );
  } finally {
    cleanup();
  }
});

test("diff: unresolvable refs and non-repo targets refuse honestly", { skip: gitSkip }, async () => {
  const { repo, doctor, cleanup } = setup();
  try {
    git(repo, ["commit", "--allow-empty", "-m", "base"]);
    await assert.rejects(() => runDiff(specOf(repo, doctor), "no-such-ref", []), /--base failed to resolve/);
    const nogit = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-nogit-"));
    try {
      fs.writeFileSync(path.join(nogit, "x.ts"), "const BAD = 1\n");
      await assert.rejects(() => runDiff(specOf(nogit, doctor), "main", []), /--base failed: .*not a git repository/s);
    } finally {
      fs.rmSync(nogit, { recursive: true, force: true });
    }
  } finally {
    cleanup();
  }
});
