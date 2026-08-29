#!/usr/bin/env node
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const args = process.argv.slice(2);
let agent = "claude";
let fresh = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--agent") agent = args[++i];
  else if (args[i] === "--fresh") fresh = true;
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const intentsFile = path.join(repoRoot, "dev", "first-shot.intents.txt");
const cli = path.join(repoRoot, "bin", "cli.js");
const stateFile = path.join(repoRoot, "dev", "first-shot-state.json");
const resultsFile = path.join(repoRoot, "docs", "first-shot-results.md");

const intents = fs.readFileSync(intentsFile, "utf8")
  .split("\n")
  .map(l => l.trim())
  .filter(l => l && !l.startsWith("#"));

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return {};
  }
}

let state = loadState();
if (fresh) {
  state = {};
  try { fs.rmSync(stateFile, { force: true }); } catch {}
}

function slugOf(intent) {
  return intent.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim().split(/\s+/).slice(0, 5).join("-");
}

function writeResults(intentsList, stateData) {
  const rows = intentsList.map(intent => {
    const e = stateData[intent] || { result: "PENDING" };
    return `| ${e.result} | ${intent} | ${e.detail ?? ""} |`;
  });
  const passed = intentsList.filter(i => stateData[i]?.result === "PASS").length;
  const decided = intentsList.filter(i => stateData[i]?.result && stateData[i].result !== "PENDING").length;
  const out = [
    "# First-shot yield results",
    "",
    `Run: ${new Date().toISOString()} · agent: ${agent} · gate: any-doctor verify`,
    "",
    `**${passed}/${decided} passed so far (${intentsList.length - decided} remaining)**`,
    "",
    "| result | intent | detail |",
    "|---|---|---|",
    ...rows,
    "",
  ].join("\n");
  fs.writeFileSync(resultsFile, out);
}

writeResults(intents, state);

const PER_INTENT_TIMEOUT_MS = 10 * 60 * 1000;

for (let i = 0; i < intents.length; i++) {
  const intent = intents[i];
  if (state[intent]?.result === "PASS") {
    console.log(`[${i + 1}/${intents.length}] SKIP (already passed): ${intent}`);
    continue;
  }
  const slug = slugOf(intent);
  process.stdout.write(`[${i + 1}/${intents.length}] ${intent}\n  generating via ${agent} ... `);

  const r = spawnSync(node(), [cli, "generate", intent, "--agent", agent], {
    encoding: "utf8",
    timeout: PER_INTENT_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });

  let result, detail;
  if (r.error && r.error.code === "ETIMEDOUT") {
    result = "TIMEOUT";
    detail = "exceeded " + PER_INTENT_TIMEOUT_MS / 60000 + "min";
  } else if (r.signal === "SIGKILL") {
    result = "TIMEOUT";
    detail = "killed at " + PER_INTENT_TIMEOUT_MS / 60000 + "min";
  } else if (r.status === 0) {
    result = "PASS";
    detail = "";
  } else {
    result = "FAIL";
    detail = (r.stderr || r.stdout || "exit " + r.status).trim().split("\n").slice(-2).join(" | ").slice(0, 200);
  }

  state[intent] = { result, detail, slug };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  writeResults(intents, state);
  console.log(result + (detail ? ` — ${detail}` : ""));
}

function node() {
  return process.execPath;
}

const passed = intents.filter(i => state[i]?.result === "PASS").length;
console.log("");
console.log("=== first-shot yield ===");
console.log(`${passed}/${intents.length} passed · results: ${resultsFile}`);
console.log(`generated doctors kept in doctors/ for review${keepDoctorsNote()}`);

function keepDoctorsNote() {
  return " (remove individually, or verify --all to re-gate them)";
}
