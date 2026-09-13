import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const repo = process.cwd(),
  commit =
    process.argv[2] ||
    execFileSync("git", ["rev-parse", "HEAD"]).toString().trim();
const output = process.argv[3] || "/tmp/any-doctor-consumer-final";
if (fs.existsSync(output))
  throw Error("Refusing to overwrite retained artifact directory: " + output);
const source = path.join(output, "source"),
  consumer = path.join(output, "consumer");
fs.mkdirSync(source, { recursive: true });
fs.mkdirSync(consumer);
const archive = execFileSync("git", ["archive", commit], { maxBuffer: 100e6 });
execFileSync("tar", ["-x", "-C", source], { input: archive });
const pack = JSON.parse(
  execFileSync("npm", ["pack", "--ignore-scripts", "--json"], {
    cwd: source,
    encoding: "utf8",
    maxBuffer: 10e6,
  }),
)[0];
const artifact = path.join(output, pack.filename);
fs.renameSync(path.join(source, pack.filename), artifact);
const install = spawnSync(
  "npm",
  ["install", "--ignore-scripts", "--no-audit", "--no-fund", artifact],
  { cwd: consumer, encoding: "utf8", maxBuffer: 20e6 },
);
fs.writeFileSync(
  path.join(output, "install.log"),
  install.stdout + install.stderr,
);
if (install.status !== 0) throw Error("clean consumer install failed");
const installed = path.join(consumer, "node_modules/any-doctor"),
  cli = path.join(installed, "bin/cli.js");
const executableFiles = pack.files
  .filter((f) => /^(bin|doctors)\//.test(f.path))
  .map((f) => {
    const expected = createHash("sha256")
      .update(fs.readFileSync(path.join(source, f.path)))
      .digest("hex");
    const actual = createHash("sha256")
      .update(fs.readFileSync(path.join(installed, f.path)))
      .digest("hex");
    if (actual !== expected) throw Error("packed file drift: " + f.path);
    return { file: f.path, sha256: actual };
  });
const runs = [];
function run(name, args, cwd = consumer) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 40e6,
  });
  fs.writeFileSync(
    path.join(output, name + ".log"),
    result.stdout + result.stderr,
  );
  const text = (result.stdout + result.stderr).replace(/\x1b\[[0-9;]*m/g, "");
  const rowCounts = name.startsWith("verify-")
    ? {
        passed: (text.match(/^\s+✔/gm) ?? []).length,
        failed: (text.match(/^\s+✖/gm) ?? []).length,
        skipped: (text.match(/^\s+–.*skipped:/gm) ?? []).length,
      }
    : undefined;
  runs.push({
    name,
    command: [process.execPath, cli, ...args],
    cwd,
    status: result.status,
    rowCounts,
  });
  if (result.status !== 0) throw Error("packed validation failed: " + name);
  return result;
}
for (const doctor of [
  "slop",
  "async",
  "convex",
  "effect-v4-kitlangton",
  "openrouter",
])
  run("verify-" + doctor, [
    "verify",
    path.join(installed, "doctors", doctor + ".mjs"),
  ]);
const matrix = spawnSync(
  process.execPath,
  [
    path.join(repo, "dev/consumer-analysis/run-cases.mjs"),
    cli,
    path.join(output, "cases-packed.json"),
  ],
  { cwd: repo, encoding: "utf8", maxBuffer: 10e6 },
);
if (matrix.status !== 0) throw Error("packed matrix failed to execute");
const cases = JSON.parse(
  fs.readFileSync(path.join(output, "cases-packed.json")),
);
if (cases.failed || cases.skipped)
  throw Error("packed matrix failed or skipped cases");
const root = "/tmp/any-doctor-frozen-sift";
const scan = run(
  "sift-packed",
  ["run", path.join(installed, "doctors/slop.mjs"), root, "--format", "json"],
  root,
);
const data = JSON.parse(scan.stdout);
fs.writeFileSync(path.join(output, "sift-packed.json"), scan.stdout);
const local = JSON.parse(
  fs.readFileSync(
    path.join(repo, "docs/evidence/consumer-analysis/sift-after.json"),
  ),
);
const findings = (d) =>
  d.groups
    .flatMap((g) =>
      g.checks.flatMap((c) => c.findings.map((f) => ({ rule: c.rule, ...f }))),
    )
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
if (JSON.stringify(findings(data)) !== JSON.stringify(findings(local)))
  throw Error("packed/local Sift findings differ");
if (data.crashed.length || data.analysisAvailable !== true)
  throw Error("packed Sift incomplete");
const deps = spawnSync("npm", ["ls", "--json", "--all"], {
  cwd: consumer,
  encoding: "utf8",
});
const report = {
  sourceCommit: commit,
  sourceArchive: "git archive " + commit,
  artifact,
  sha256: createHash("sha256").update(fs.readFileSync(artifact)).digest("hex"),
  packageVersion: pack.version,
  node: process.version,
  install: {
    command: "npm install --ignore-scripts --no-audit --no-fund <artifact>",
    status: install.status,
  },
  executableFiles,
  runs,
  caseResults: {
    passed: cases.passed,
    failed: cases.failed,
    skipped: cases.skipped,
  },
  sift: {
    fileCount: data.fileCount,
    counts: data.counts,
    analysisAvailable: data.analysisAvailable,
    crashed: data.crashed,
    localFindingsEqual: true,
  },
  dependencies: JSON.parse(deps.stdout),
  publication: false,
};
fs.writeFileSync(
  path.join(output, "verification.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      sourceCommit: commit,
      artifact,
      sha256: report.sha256,
      cases: report.caseResults,
      sift: report.sift,
    },
    null,
    2,
  ),
);
