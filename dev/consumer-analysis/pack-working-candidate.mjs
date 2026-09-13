// Pack uncommitted working files; HEAD is recorded only as historical context.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
const repo = fs.realpathSync(process.cwd());
const requested = process.argv[2];
if (!requested || fs.existsSync(requested))
  throw Error("Supply a new output directory; retained evidence is never overwritten");
fs.mkdirSync(requested, { recursive: true });
const output = fs.realpathSync(requested);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const runs = [];
function run(name, command, args, cwd = repo) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 50e6 });
  fs.writeFileSync(path.join(output, name + ".stdout"), result.stdout ?? "");
  fs.writeFileSync(path.join(output, name + ".stderr"), result.stderr ?? "");
  runs.push({ name, command: [command, ...args], cwd, status: result.status });
  if (result.status !== 0) throw Error(`${name} failed: ${result.stderr}`);
  return result.stdout;
}
run("build", "npm", ["run", "build"]);
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: repo, encoding: "utf8" })
  .trim().split("\n").filter((f) => /^(src\/|bin\/|doctors\/|test\/|dev\/consumer-analysis\/|package(?:-lock)?\.json$|tsconfig\.json$)/.test(f)).sort();
const workingFiles = files.map((file) => ({ file, sha256: sha(fs.readFileSync(path.join(repo, file))) }));
const workingDigest = sha(JSON.stringify(workingFiles));
fs.writeFileSync(path.join(output, "working-files.json"), JSON.stringify({ repository: repo, workingDigest, files: workingFiles }, null, 2) + "\n");
const pack = JSON.parse(run("pack", "npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", output]))[0];
const artifact = fs.realpathSync(path.join(output, pack.filename));
const consumer = path.join(output, "consumer");
fs.mkdirSync(consumer);
run("install", "npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", artifact], consumer);
run("dependencies", "npm", ["ls", "--all", "--json"], consumer);
const installed = path.join(consumer, "node_modules/any-doctor");
const cli = path.join(installed, "bin/cli.js");
const executableFiles = pack.files.filter((f) => /^(bin\/|doctors\/|package\.json$)/.test(f.path)).map(({ path: file }) => {
  const sha256 = sha(fs.readFileSync(path.join(repo, file)));
  if (sha(fs.readFileSync(path.join(installed, file))) !== sha256) throw Error("installed drift: " + file);
  return { file, sha256 };
});
for (const doctor of ["slop", "async", "convex", "effect-v4-kitlangton", "openrouter"])
  run("verify-" + doctor, process.execPath, [cli, "verify", path.join(installed, "doctors", doctor + ".mjs")], consumer);
run("bundled-discovery", process.execPath, [cli, "verify", "--all"], consumer);
run("labeled", process.execPath, [path.join(repo, "dev/consumer-analysis/run-cases.mjs"), cli, path.join(output, "labeled.json")], consumer);
const labeled = JSON.parse(fs.readFileSync(path.join(output, "labeled.json")));
if (labeled.failed || labeled.skipped) throw Error("labeled JSON gate failed");
run("independent", "python3", [path.join(repo, "dev/consumer-analysis/independent-challenges.py"), "packed", output, cli], consumer);
const independent = JSON.parse(fs.readFileSync(path.join(output, "packed-independent-challenges.json")));
const failedNames = independent.rows.filter((r) => !r.passed).map((r) => r.name);
if (independent.passed !== 29 || independent.skipped !== 0 || JSON.stringify(failedNames) !== '["mts-authored-positive"]')
  throw Error("unexpected independent challenge failure (the mts expectation remains unchanged)");
run("independent-repair", "python3", [path.join(repo, "dev/consumer-analysis/independent-repair-challenges.py"), "packed", cli, output], consumer);
const repairChallenges = JSON.parse(fs.readFileSync(path.join(output, "packed-new-challenges.json")));
const repairFailedNames = repairChallenges.rows.filter((r) => !r.passed).map((r) => r.name);
if (repairChallenges.passed !== 32 || repairChallenges.skipped !== 0 || JSON.stringify(repairFailedNames) !== '["inherited-cts"]')
  throw Error("unexpected independent repair challenge failure (the cts expectation remains unchanged)");
run("loader-scopes", process.execPath, [path.join(repo, "dev/consumer-analysis/check-loader-scopes.mjs"), path.join(installed, "bin/project-consumers.js"), path.join(output, "loader-scopes.json")], consumer);
const loaderScopes = JSON.parse(fs.readFileSync(path.join(output, "loader-scopes.json")));
if (loaderScopes.failed || loaderScopes.skipped) throw Error("loader-scope JSON gate failed");
run("combination", "python3", [path.join(repo, "dev/consumer-analysis/independent-combination-challenges.py"), "packed", cli, output], consumer);
const combination = JSON.parse(fs.readFileSync(path.join(output, "packed-extra-results.json")));
if (combination.passed !== 12 || combination.failed || combination.skipped ||
  combination.rows.some((row) => row.runtime && row.runtime.exitCode !== 0))
  throw Error("combination findings/runtime JSON gate failed");
run("result-flow-isolation", "python3", [path.join(repo, "dev/consumer-analysis/independent-result-flow-isolation.py"), path.join(output, "isolation-review"), installed], consumer);
const isolationRows = JSON.parse(fs.readFileSync(path.join(output, "isolation-review/result-flow-isolation.json")));
const isolation = Object.fromEntries(["local", "packed"].map((label) => {
  const rows = isolationRows.filter((row) => row.label === label);
  const passed = rows.filter((row) => row.passed && row.exitCode === 0 && row.runtimeExit === 0 &&
    JSON.stringify(row.uncertainFiles) === '["src/target.ts"]' &&
    row.deadEvidence.every((binding) => binding.evidence.length === 0)).length;
  if (rows.length !== 4 || passed !== 4) throw Error(label + " result-flow isolation JSON gate failed");
  return [label, { passed, failed: rows.length - passed, skipped: 0 }];
}));
run("sift", process.execPath, [cli, "run", path.join(installed, "doctors/slop.mjs"), "/tmp/any-doctor-frozen-sift", "--format", "json"], consumer);
for (const { file, sha256 } of workingFiles)
  if (sha(fs.readFileSync(path.join(repo, file))) !== sha256) throw Error("working-file drift: " + file);
const counts = Object.fromEntries(runs.filter((r) => r.name.startsWith("verify-")).map(({ name }) => {
  const log = fs.readFileSync(path.join(output, name + ".stdout"), "utf8").replace(/\x1b\[[0-9;]*m/g, "");
  return [name, { passed: (log.match(/^\s+✔/gm) ?? []).length, failed: (log.match(/^\s+✖/gm) ?? []).length, skipped: (log.match(/^\s+–.*skipped:/gm) ?? []).length }];
}));
const report = { combination: {passed: combination.passed, failed: combination.failed, skipped: combination.skipped}, isolation, repairChallenges: {passed: repairChallenges.passed, failed: repairChallenges.failed, skipped: repairChallenges.skipped, failedNames: repairFailedNames}, loaderScopes: {passed: loaderScopes.passed, failed: loaderScopes.failed, skipped: loaderScopes.skipped}, repository: repo, headContextOnly: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), candidate: "uncommitted working files", node: process.version, packageVersion: pack.version, artifact, artifactSha256: sha(fs.readFileSync(artifact)), workingDigest, executableFiles, counts, labeled: { passed: labeled.passed, failed: labeled.failed, skipped: labeled.skipped }, independent: { passed: independent.passed, failed: independent.failed, skipped: independent.skipped, failedNames }, runs };
fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ artifact, sha256: report.artifactSha256, workingDigest, counts, labeled: report.labeled, independent: report.independent }, null, 2));
