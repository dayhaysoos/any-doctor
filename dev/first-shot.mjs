#!/usr/bin/env node
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const args = process.argv.slice(2);
let agent = "claude";
let keep = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--agent") agent = args[++i];
  else if (args[i] === "--keep") keep = true;
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const intentsFile = path.join(repoRoot, "dev", "first-shot.intents.txt");
const cli = path.join(repoRoot, "bin", "cli.js");

const intents = fs.readFileSync(intentsFile, "utf8")
  .split("\n")
  .map(l => l.trim())
  .filter(l => l && !l.startsWith("#"));

if (intents.length === 0) {
  console.error("no intents found in " + intentsFile);
  process.exit(1);
}

const rows = [];
let passed = 0;

for (let i = 0; i < intents.length; i++) {
  const intent = intents[i];
  const slug = intent.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim().split(/\s+/).slice(0, 5).join("-");
  process.stdout.write(`[${i + 1}/${intents.length}] ${intent}\n  generating via ${agent} ... `);
  const r = spawnSync(node(), [cli, "generate", intent, "--agent", agent], {
    encoding: "utf8",
    timeout: 15 * 60 * 1000,
  });
  const okRun = r.status === 0;
  if (okRun) passed++;
  rows.push({
    intent,
    slug,
    result: okRun ? "PASS" : "FAIL",
    detail: okRun ? "" : (r.stderr || r.stdout || "").trim().split("\n").slice(-2).join(" | "),
  });
  console.log(okRun ? "PASS" : "FAIL");
  if (!keep) {
    for (const f of [path.join(repoRoot, "doctors", slug + ".mjs"), path.join(repoRoot, "doctors", slug + ".fixtures.mjs")]) {
      try { fs.rmSync(f, { force: true }); } catch {}
    }
  }
}

function node() {
  return process.execPath;
}

console.log("");
console.log("=== first-shot yield ===");
console.log(`${passed}/${intents.length} doctors passed the verify gate on the first attempt`);
console.log("");
for (const row of rows) {
  console.log(`| ${row.result} | ${row.intent} | ${row.detail} |`);
}

const out = [
  "# First-shot yield results",
  "",
  `Run: ${new Date().toISOString()} · agent: ${agent} · gate: any-doctor verify`,
  "",
  `**${passed}/${intents.length} passed**`,
  "",
  "| result | intent | detail |",
  "|---|---|---|",
  ...rows.map(r => `| ${r.result} | ${r.intent} | ${r.detail} |`),
  "",
].join("\n");
fs.writeFileSync(path.join(repoRoot, "docs", "first-shot-results.md"), out);
console.log("wrote docs/first-shot-results.md");
