import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCapabilityGapReport } from "../../../bin/authoring.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const report = JSON.parse(readFileSync(join(here, "browser-env-capability-gap.json"), "utf8"));
const validation = validateCapabilityGapReport(report);
assert.deepEqual(validation, { valid: true, errors: [] });

let passed = 0;
for (const [name, stake] of Object.entries(report.acceptanceCases)) {
  const target = mkdtempSync(join(tmpdir(), "deepgram-gap-"));
  try {
    for (const [file, source] of Object.entries(stake.seed)) {
      const destination = join(target, file);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, source);
    }
    const output = execFileSync(process.execPath, [
      join(repo, "bin/cli.js"), "run", join(repo, "doctors/deepgram.mjs"), target, "--format", "json",
    ], { cwd: repo, encoding: "utf8" });
    const run = JSON.parse(output);
    const group = run.groups[0];
    const findings = group.checks.flatMap((check) => check.findings.map((finding) => ({
      rule: check.rule, file: finding.file, line: finding.line, column: finding.column,
    })));
    assert.deepEqual(findings, stake.findings, `${name}: findings`);
    const reasons = [...new Set((group.semantic?.narrowed ?? []).map((item) => item.reason))].sort();
    assert.deepEqual(reasons, [...stake.narrowing.reasons].sort(), `${name}: narrowing reasons`);
    assert.equal(group.semantic?.incomplete ? "narrowed" : "complete", stake.narrowing.state, `${name}: narrowing state`);
    assert.equal(run.score.score === null ? "null" : "present", stake.score, `${name}: score`);
    assert.equal(run.score.grade === null ? "null" : "present", stake.grade, `${name}: grade`);
    assert.deepEqual(run.crashed, [], `${name}: crashes`);
    assert.deepEqual(run.broken, [], `${name}: broken doctors`);
    assert.deepEqual(run.skippedUnsafe, [], `${name}: skipped doctors`);
    passed++;
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ passed, failed: 0, skipped: 0 }));
