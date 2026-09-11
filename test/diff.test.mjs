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
const { runDiff, captureHeadScan } = await import("../bin/diff.js");
const { digestTextFile, doctorDigests } = await import("../bin/identity.js");

// The cli-shaped capture flow: digests BEFORE the scan, evidence taken
// immediately AFTER it — the same adjacency production honors.
const headOf = (spec, ran) =>
  captureHeadScan(spec.targetDir, deriveSummary(ran).groups, ran.analysisAvailable ?? false, doctorDigests(spec.doctors, digestTextFile));

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

async function headRun(repo, doctor) {
  const ran = await runCohort(specOf(repo, doctor));
  assert.deepEqual(ran.crashed, [], "the HEAD scan is healthy in these fixtures");
  return ran;
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

    const ran = await headRun(repo, doctor);
    assert.deepEqual(deriveSummary(ran).groups[0].findings.map(f => f.file).sort(), ["b.ts", "c.ts"], "HEAD sees b and c");
    const d = await runDiff(specOf(repo, doctor), "main", headOf(specOf(repo, doctor), ran));
    assert.deepEqual(d.added.map(a => a.file).sort(), ["b.ts", "c.ts"], "added: what the change introduced");
    assert.deepEqual(d.noLongerDetected.map(r => r.file), ["a.ts"], "no longer detected: the base occurrence without a head counterpart");
    assert.equal(d.continuing, 0);
    assert.equal(d.provenance.comparable, true, "same doctor programs ran on both sides");
    assert.match(d.headSha, /^[0-9a-f]{40}$/, "the head side's source state is attributed");
    assert.equal(typeof d.headDirty, "boolean");
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
    const ran = await headRun(s.targetDir, doctor);
    const d = await runDiff(s, "main", headOf(s, ran));
    assert.deepEqual(d.added.map(a => a.file), ["x.ts"], "everything in the invented directory is added");
    assert.deepEqual(d.noLongerDetected, []);
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

    const ran = await headRun(repo, doctor);
    await assert.rejects(
      () => runDiff(specOf(repo, doctor), "main", headOf(specOf(repo, doctor), ran)),
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
    await assert.rejects(() => runDiff(specOf(repo, doctor), "no-such-ref", headOf(specOf(repo, doctor), { crashed: [], groups: [], skippedUnsafe: [], doctorPaths: new Map(), fileCount: 0, durationMs: 0, targetDir: repo, analysisAvailable: false })), /--base failed to resolve/);
    const nogit = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-nogit-"));
    try {
      fs.writeFileSync(path.join(nogit, "x.ts"), "const BAD = 1\n");
      await assert.rejects(() => runDiff(specOf(nogit, doctor), "main", headOf(specOf(nogit, doctor), { crashed: [], groups: [], skippedUnsafe: [], doctorPaths: new Map(), fileCount: 0, durationMs: 0, targetDir: nogit, analysisAvailable: false })), /--base failed: .*not a git repository/s);
    } finally {
      fs.rmSync(nogit, { recursive: true, force: true });
    }
  } finally {
    cleanup();
  }
});

// ---- identity through the real diff path (A2) ---------------------------
//
// The line-marker doctor reports each BAD line at its actual position, so
// base/head states compose precisely around movement.

const LINE_MARKER = [
  "export const meta = { id: 'linemarker', description: 'flags BAD lines where they are', severity: 'warning' }",
  "export async function doctor(ctx) {",
  "  for (const file of ctx.files.list()) {",
  "    const src = ctx.files.read(file)",
  '    if (src.includes("CRASH")) throw new Error("linemarker-boom")',
  '    src.split("\\n").forEach((l, i) => { if (l.includes("BAD")) ctx.report.finding({ file, line: i + 1 }) })',
  "  }",
  "}",
].join("\n");

function setupLineMarker() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-diff-id-"));
  const doctorDir = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-doctor-id-"));
  const doctor = path.join(doctorDir, "linemarker.mjs");
  fs.writeFileSync(doctor, LINE_MARKER);
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "test@any-doctor"]);
  git(repo, ["config", "user.name", "any-doctor test"]);
  return { repo, doctor, cleanup: () => { fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(doctorDir, { recursive: true, force: true }); } };
}

test("diff: a renamed file is absence plus addition — no unproven cross-file continuity", { skip: gitSkip }, async () => {
  const { repo, doctor, cleanup } = setupLineMarker();
  try {
    fs.writeFileSync(path.join(repo, "f.ts"), "const BAD = 1;\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "base"]);
    git(repo, ["mv", "f.ts", "g.ts"]);
    git(repo, ["commit", "-m", "rename"]);
    const ran = await runCohort(specOf(repo, doctor));
    const d = await runDiff(specOf(repo, doctor), "HEAD~1", headOf(specOf(repo, doctor), ran));
    assert.equal(d.continuing, 0, "cross-file rename continuity is outside the initial guarantee");
    assert.deepEqual(d.added.map(a => a.file), ["g.ts"], "the new path is added");
    assert.deepEqual(d.noLongerDetected.map(a => a.file), ["f.ts"], "the old path is honestly absent");
  } finally {
    cleanup();
  }
});

test("diff: a finding that moved with its code is continuing, not added plus absent", { skip: gitSkip }, async () => {
  const { repo, doctor, cleanup } = setupLineMarker();
  try {
    fs.writeFileSync(path.join(repo, "f.ts"), "function w() {\n  const BAD = 1;\n}\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "base"]);
    // The working tree (uncommitted, dirty) moves the flagged line down —
    // the identity layer must follow the occurrence, not the coordinates.
    fs.writeFileSync(path.join(repo, "f.ts"), "function w() {\n\n  const BAD = 1;\n}\n");
    const ran = await runCohort(specOf(repo, doctor));
    const groups = deriveSummary(ran).groups;
    assert.equal(groups[0].findings[0].line, 3, "the finding's coordinates moved");
    const d = await runDiff(specOf(repo, doctor), "main", headOf(specOf(repo, doctor), ran));
    assert.equal(d.continuing, 1, "the occurrence continues");
    assert.deepEqual(d.added, [], "movement is not addition");
    assert.deepEqual(d.noLongerDetected, [], "movement is not disappearance");
  } finally {
    cleanup();
  }
});

test("diff: a changed flagged line is added plus no-longer-detected, never continuing", { skip: gitSkip }, async () => {
  const { repo, doctor, cleanup } = setupLineMarker();
  try {
    fs.writeFileSync(path.join(repo, "f.ts"), "const BAD = 1;\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "base"]);
    fs.writeFileSync(path.join(repo, "f.ts"), "const BAD = 2;\n");
    const ran = await runCohort(specOf(repo, doctor));
    const d = await runDiff(specOf(repo, doctor), "main", headOf(specOf(repo, doctor), ran));
    assert.equal(d.continuing, 0, "changed content never continues");
    assert.deepEqual(d.added.map(a => a.line), [1]);
    assert.deepEqual(d.noLongerDetected.map(a => a.line), [1]);
  } finally {
    cleanup();
  }
});

test("diff: a third identical occurrence cannot hide behind the two that existed", { skip: gitSkip }, async () => {
  const { repo, doctor, cleanup } = setupLineMarker();
  try {
    fs.writeFileSync(path.join(repo, "f.ts"), "const BAD = 1;\nconst BAD = 1;\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "base"]);
    fs.writeFileSync(path.join(repo, "f.ts"), "const BAD = 1;\nconst BAD = 1;\nconst BAD = 1;\n");
    const ran = await runCohort(specOf(repo, doctor));
    const d = await runDiff(specOf(repo, doctor), "main", headOf(specOf(repo, doctor), ran));
    assert.equal(d.continuing, 2);
    assert.equal(d.added.length, 1, "the third copy is added and gates");
    assert.equal(d.noLongerDetected.length, 0);
    assert.equal(d.ambiguous, 1, "the duplicate bucket is reported");
  } finally {
    cleanup();
  }
});

test("diff: identical text in two different functions does not share an identity when the engine is present", { skip: gitSkip }, async () => {
  const { repo, doctor, cleanup } = setupLineMarker();
  try {
    fs.writeFileSync(path.join(repo, "f.ts"), "function a() {\n  doWork(BAD);\n}\nfunction b() {\n  doWork(BAD);\n}\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "base"]);
    // a() is deleted; the b() occurrence must continue, not be confused
    // with a()'s identical text.
    fs.writeFileSync(path.join(repo, "f.ts"), "function b() {\n  doWork(BAD);\n}\n");
    const ran = await runCohort(specOf(repo, doctor));
    const d = await runDiff(specOf(repo, doctor), "main", headOf(specOf(repo, doctor), ran));
    if (ran.analysisAvailable) {
      assert.equal(d.continuing, 1, "the b() occurrence continues by context");
      assert.deepEqual(d.added, []);
      assert.equal(d.noLongerDetected.length, 1, "the a() occurrence is gone");
    } else {
      // Engine off: the documented fallback matches identical content in
      // the file — and says so.
      assert.equal(d.continuing, 1);
      assert.equal(d.contextFallback, 1);
      assert.deepEqual(d.added, []);
      assert.deepEqual(d.noLongerDetected, []);
    }
  } finally {
    cleanup();
  }
});

// ---- execution-bound provenance and evidence (review finding 2) --------
//
// Both probes from the independent review, as regression cases: evidence
// must describe the bytes the scan saw, and doctor digests must bracket
// their own executions.

test("diff: a file restored after the head scan cannot borrow old bytes — occurrences go stale", { skip: gitSkip }, async () => {
  const { repo, doctor, cleanup } = setupLineMarker();
  try {
    fs.writeFileSync(path.join(repo, "f.ts"), "const BAD = 1;\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "base"]);
    // The head scan runs on v2 (the finding's real content)...
    fs.writeFileSync(path.join(repo, "f.ts"), "const BAD = 2;\n");
    const ran = await runCohort(specOf(repo, doctor));
    // ...the command layer captures evidence at scan-adjacency (v2)...
    const head = headOf(specOf(repo, doctor), ran);
    // ...and only THEN is the file restored to v1 — the review's probe.
    fs.writeFileSync(path.join(repo, "f.ts"), "const BAD = 1;\n");
    const d = await runDiff(specOf(repo, doctor), "main", head);
    assert.equal(d.continuing, 0, "a v2-scanned finding never continues through v1 bytes");
    assert.equal(d.added.length, 1, "the changed-after-scan occurrence surfaces as added and gates");
    assert.equal(d.noLongerDetected.length, 1, "the base occurrence is honestly absent");
    assert.ok(d.stale >= 1, "the changed file is reported stale");
  } finally {
    cleanup();
  }
});

test("diff: a doctor mutated between the two executions refuses comparability", { skip: gitSkip }, async () => {
  const { repo, doctor, cleanup } = setupLineMarker();
  try {
    fs.writeFileSync(path.join(repo, "f.ts"), "const BAD = 1;\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "base"]);
    fs.writeFileSync(path.join(repo, "f.ts"), "const BAD = 1;\nconst OTHER = 2;\n");
    // Head digests are captured BEFORE the head scan, as the CLI does...
    const headDigests = doctorDigests(specOf(repo, doctor).doctors, digestTextFile);
    const ran = await runCohort(specOf(repo, doctor));
    // ...then the doctor's bytes change before the base side captures its
    // own pre-scan digests — the two executions ran different programs.
    fs.appendFileSync(doctor, "\n// a valid edit, different bytes\n");
    const head = captureHeadScan(specOf(repo, doctor).targetDir, deriveSummary(ran).groups, ran.analysisAvailable ?? false, headDigests);
    const d = await runDiff(specOf(repo, doctor), "main", head);
    assert.equal(d.provenance.comparable, false, "pre-scan digests bracket their executions and differ");
    assert.equal(d.continuing, 0, "no continuity through a changed detector");
    assert.ok(d.added.length >= 1 && d.noLongerDetected.length >= 1, "everything surfaces as added/absent");
  } finally {
    cleanup();
  }
});
