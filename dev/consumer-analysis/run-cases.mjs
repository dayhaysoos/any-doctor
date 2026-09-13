import { cases } from "./cases.mjs";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const cli = resolve(process.argv[2] || "bin/cli.js");
const doctor = join(dirname(dirname(cli)), "doctors", "slop.mjs");
const rows = [];
for (const c of cases) {
  const root = mkdtempSync(join(tmpdir(), "any-doctor-case-"));
  try {
    for (const [file, source] of Object.entries(c.seed)) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), source);
    }
    const run = spawnSync(
      process.execPath,
      [
        cli,
        "run",
        doctor,
        root,
        "--format",
        "json",
        ...(c.includeTests ? ["--include-tests"] : []),
      ],
      { encoding: "utf8", maxBuffer: 20e6, cwd: root },
    );
    let data;
    try {
      data = JSON.parse(run.stdout);
    } catch {}
    const findings =
      data?.groups?.flatMap((g) =>
        g.checks.flatMap((check) =>
          check.findings.map((f) => ({ ...f, rule: check.rule })),
        ),
      ) ?? [];
    const exports = findings
      .filter((f) => f.rule === "export-without-any-consumer")
      .map(
        (f) =>
          f.file + ":" + f.message.match(/no consumer found for (\w+)/)?.[1],
      )
      .sort();
    const duplicates = findings.filter(
      (f) => f.rule === "identical-helper-body-in-two-modules",
    ).length;
    const coverageIssues = data?.groups?.flatMap((group) => group.analysisCoverage?.issues ?? []) ?? [];
    const coverageMatches = c.coverageContains === undefined ||
      (c.coverageContains === "" ? coverageIssues.length === 0 :
        coverageIssues.some((issue) => issue.includes(c.coverageContains)));
    const passed = c.failure
      ? run.status !== 0 && !!data?.crashed?.length
      : run.status === 0 && coverageMatches &&
        data?.analysisAvailable === true &&
        JSON.stringify(exports) === JSON.stringify(c.exports.toSorted()) &&
        (c.duplicates === undefined || duplicates === c.duplicates);
    rows.push({
      name: c.name,
      passed,
      status: run.status,
      expected: {
        exports: c.exports,
        duplicates: c.duplicates,
        failure: c.failure,
        includeTests: c.includeTests ?? false,
      },
      observed: {
        exports,
        duplicates,
        fileCount: data?.fileCount,
        analysisAvailable: data?.analysisAvailable,
        findings,
        coverageIssues: data?.groups?.flatMap(
          (g) => g.analysisCoverage?.issues ?? [],
        ),
        crashed: data?.crashed,
      },
      stderr: run.stderr.replaceAll(root, "<fixture>"),
      stdout: data ? undefined : run.stdout.replaceAll(root, "<fixture>"),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const report = {
  cli,
  doctor,
  node: process.version,
  flags:
    "run slop <fixture> --format json; --include-tests only where specified",
  passed: rows.filter((r) => r.passed).length,
  failed: rows.filter((r) => !r.passed).length,
  skipped: 0,
  rows,
};
writeFileSync(
  process.argv[3] || "docs/evidence/consumer-analysis/cases-before.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log({ passed: report.passed, failed: report.failed, skipped: 0 });
