#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { RunResult, VerifyRunResult, ReportGroup, Finding } from "./contract.js";
import { renderReport } from "./report.js";
import { copyToClipboard } from "./clipboard.js";
import { runDashboard } from "./dashboard.js";
import { discoverDoctors, globalDoctorsDir, resolveDoctorPath, DiscoveredDoctor } from "./discover.js";
import { pickItem } from "./picker.js";
import { buildFixPrompt } from "./handoff.js";
import { countAll, describeRunnerError, isRunnerError, runDoctor, verifyDoctor } from "./runner.js";

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m",
      DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

function fail(msg: string): void {
  console.error(RED + msg + RESET);
}

function ok(msg: string): void {
  console.log(GREEN + msg + RESET);
}

function warn(msg: string): void {
  console.log(YELLOW + msg + RESET);
}

function dim(msg: string): string {
  return DIM + msg + RESET;
}

function skillText(): string | null {
  const p = fileURLToPath(new URL("../skill/any-doctor.skill.md", import.meta.url));
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function useColor(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

// The one place the command layer crosses the Runner seam: a failure here is
// a failure of the whole command, so it renders and exits. Exit policy lives
// in this layer, never in the Runner.
async function runOrExit<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (e) {
    fail(isRunnerError(e) ? describeRunnerError(e) : String(e));
    return process.exit(1);
  }
}

interface ParsedArgs {
  doctorPath?: string;
  targetDir: string;
  all: boolean;
  global: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = { targetDir: path.resolve("."), all: false, global: false };
  let targetDirSet = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--all") out.all = true;
    else if (a === "--global") out.global = true;
    else if (out.doctorPath === undefined && /\.(m|c)?js$/.test(a)) out.doctorPath = a;
    else if (!targetDirSet) {
      out.targetDir = path.resolve(a);
      targetDirSet = true;
    }
  }
  return out;
}

async function pickDoctor(cwd: string, opts?: { targetDir?: string; withCounts?: boolean }): Promise<DiscoveredDoctor> {
  const discovered = await discoverDoctors(cwd);
  const valid = discovered.filter(d => d.meta !== null);
  const broken = discovered.filter(d => d.meta === null);

  if (valid.length === 0) {
    fail(`no doctors discovered in ${cwd}/doctors or ~/.any-doctor/doctors`);
    fail('create one with: any-doctor generate "<intent>"');
    for (const b of broken) {
      fail("broken: " + b.slug + " — " + (b.error || "invalid meta"));
    }
    process.exit(1);
  }
  for (const b of broken) {
    console.log(YELLOW + "⚠ skipping broken doctor " + b.slug + RESET + dim(" — " + (b.error || "invalid meta")));
  }

  // A doctor whose count fails must not masquerade as the healthiest "0
  // issues" candidate: failures sort last and say so.
  let counted: { d: DiscoveredDoctor; count: number | "error" }[] = valid.map(d => ({ d, count: "error" as const }));
  if (opts?.withCounts && opts.targetDir) {
    const results = await countAll({ programPaths: valid.map(d => d.path), targetDir: opts.targetDir });
    counted = valid.map((d, i) => {
      const r = results[i];
      return { d, count: "count" in r ? r.count : "error" as const };
    });
    counted.sort((a, b) => {
      const av = a.count === "error" ? -1 : a.count;
      const bv = b.count === "error" ? -1 : b.count;
      return bv - av;
    });
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("available doctors:");
    for (const { d, count } of counted) {
      const suffix = count === "error"
        ? RED + " count failed" + RESET
        : dim(" " + count + " issue" + (count === 1 ? "" : "s"));
      console.log("  " + d.scope.padEnd(7) + d.slug.padEnd(32) + dim(d.meta!.description) + suffix);
    }
    fail("non-interactive session — specify a doctor path");
    process.exit(1);
  }

  const chosen = await pickItem(counted.map(({ d, count }) => ({
    id: d.slug,
    label: d.meta!.description,
    sub: count === "error"
      ? `count failed · ${d.scope}`
      : `${count} issue${count === 1 ? "" : "s"} · ${d.scope}`,
    severity: d.meta!.severity,
  })), useColor(), "Select a doctor");
  if (chosen === null) process.exit(0);
  return counted.find(x => x.d.slug === chosen.id)!.d;
}

interface Scan {
  result: RunResult;
  groups: ReportGroup[];
  findings: Finding[];
  fileCount: number;
  durationMs: number;
}

async function scanOnce(doctorAbs: string, targetDir: string): Promise<Scan> {
  const result = await runOrExit(runDoctor({ programPath: doctorAbs, targetDir }));
  return {
    result,
    groups: [{ programName: path.basename(doctorAbs), meta: result.meta, findings: result.findings }],
    findings: result.findings,
    fileCount: result.fileCount,
    durationMs: result.durationMs,
  };
}

async function cmdRun(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  const started = Date.now();

  if (parsed.all) {
    const discovered = (await discoverDoctors(process.cwd())).filter(d => d.meta !== null);
    if (discovered.length === 0) {
      fail("no doctors discovered — run from a directory with doctors/, or specify a doctor path");
      process.exit(1);
    }
    const groups: ReportGroup[] = [];
    let fileCount = 0;
    for (const d of discovered) {
      const scan = await scanOnce(d.path, parsed.targetDir);
      fileCount = Math.max(fileCount, scan.fileCount);
      groups.push(...scan.groups);
    }
    console.log(renderReport({ fileCount, durationMs: Date.now() - started, groups }, useColor()));
    return;
  }

  let doctorAbs: string;
  if (parsed.doctorPath) {
    const resolved = resolveDoctorPath(parsed.doctorPath, process.cwd());
    if (resolved === null) {
      fail(`no doctor program found for "${parsed.doctorPath}"`);
      fail(`searched ./doctors (walking up from ${process.cwd()}) and ~/.any-doctor/doctors`);
      process.exit(1);
    }
    doctorAbs = resolved;
  } else {
    const chosen = await pickDoctor(process.cwd(), { targetDir: parsed.targetDir, withCounts: true });
    doctorAbs = chosen.path;
  }

  const scan = await scanOnce(doctorAbs, parsed.targetDir);
  const ttyCols = process.stdout.columns ?? 0;
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !process.env.ANY_DOCTOR_HEADLESS && (ttyCols === 0 || ttyCols >= 60);

  if (!interactive) {
    console.log(renderReport({ fileCount: scan.fileCount, durationMs: scan.durationMs, groups: scan.groups }, useColor()));
    return;
  }

  await runDashboard({
    root: parsed.targetDir,
    groups: scan.groups,
    doctorFile: doctorAbs,
    fileCount: scan.fileCount,
    durationMs: scan.durationMs,
    useColor: useColor(),
  });
}



interface VerifyCase {
  name: string;
  ok: boolean;
  missing: { file: string; line: number }[];
  unexpected: { file: string; line: number }[];
  error?: string;
}

function printVerifyResult(result: VerifyRunResult): number {
  const color = useColor();
  const g = (s: string): string => (color ? GREEN + s + RESET : s);
  const r = (s: string): string => (color ? RED + s + RESET : s);
  let failures = 0;
  for (const c of result.results) {
    if (c.ok) {
      console.log(g("  ✔ " + c.name));
    } else {
      failures++;
      console.log(r("  ✖ " + c.name));
      for (const m of c.missing) console.log("    " + r("missing expected finding") + " " + m.file + ":" + m.line);
      for (const u of c.unexpected) console.log("    " + r("unexpected finding") + " " + u.file + ":" + u.line);
      if (c.error) console.log("    " + r("crashed: ") + c.error);
    }
  }
  return failures;
}

async function cmdVerify(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.all) {
    const discovered = (await discoverDoctors(process.cwd())).filter(d => d.meta !== null);
    if (discovered.length === 0) {
      fail("no doctors discovered");
      process.exit(1);
    }
    let totalFailures = 0;
    for (const d of discovered) {
      console.log(BOLD + d.meta!.id + RESET);
      const r = await runOrExit(verifyDoctor({ programPath: d.path }));
      totalFailures += printVerifyResult(r);
      console.log("");
    }
    if (totalFailures > 0) {
      fail(totalFailures + " fixture(s) failed");
      process.exit(1);
    }
    ok("all doctors fixture-green");
    return;
  }

  let doctorPath = parsed.doctorPath;
  if (!doctorPath) {
    const chosen = await pickDoctor(process.cwd());
    doctorPath = chosen.path;
  }
  const resolvedVerify = resolveDoctorPath(doctorPath, process.cwd());
  if (resolvedVerify === null) {
    fail(`no doctor program found for "${doctorPath}"`);
    process.exit(1);
  }
  doctorPath = resolvedVerify;
  const result = await runOrExit(verifyDoctor({ programPath: doctorPath }));
  const failures = printVerifyResult(result);
  console.log("");
  console.log(dim(`${result.results.length - failures}/${result.results.length} fixtures passed for ${result.meta.id}`));
  if (failures > 0) process.exit(1);
}

async function cmdGenerate(args: string[]): Promise<void> {
  let intent: string | undefined;
  let global = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--global") global = true;
    else if (intent === undefined) intent = args[i];
  }
  if (!intent) {
    fail('usage: any-doctor generate "<one-line intent>" [--global]');
    process.exit(1);
  }
  const skill = skillText();
  if (skill === null) {
    fail("generation skill not found (skill/any-doctor.skill.md missing).");
    process.exit(1);
  }

  const slug = slugify(intent);
  const scopeDir = global
    ? (fs.mkdirSync(globalDoctorsDir(), { recursive: true }), globalDoctorsDir())
    : path.resolve("doctors");
  fs.mkdirSync(scopeDir, { recursive: true });

  const agentsPath = path.join(scopeDir, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, skill);
  }

  const cliJs = fileURLToPath(new URL("cli.js", import.meta.url));
  const doctorAbs = path.join(scopeDir, slug + ".mjs");
  const prompt = [
    skill,
    "",
    "## Your task",
    "",
    "INTENT (the entire specification):",
    "  " + intent,
    "",
    "Working directory is the doctor pack root. Write exactly two files:",
    "  " + slug + ".mjs",
    "  " + slug + ".fixtures.mjs",
    "",
    "Then verify with exactly this command and iterate until every fixture passes:",
    '  node "' + cliJs + '" verify "' + doctorAbs + '"',
    "Then stop and report.",
  ].join("\n");

  console.log(BOLD + "doctor prompt ready: " + CYAN + slug + RESET + dim(global ? " (global scope)" : ""));
  console.log("");
  if (copyToClipboard(prompt)) {
    ok("prompt copied to clipboard — paste it into your own agent session");
    console.log(dim("run the agent with this as its working directory: " + scopeDir));
    console.log(dim("(the skill is planted there as AGENTS.md — most agents load it automatically)"));
  } else {
    console.log(prompt);
    warn("clipboard unavailable — copy the prompt above");
  }
  console.log("");
  console.log(dim("once your agent has written both files, gate it:"));
  console.log(dim('  node "' + cliJs + '" verify "' + doctorAbs + '"'));
}

const STOP_WORDS = new Set(["a", "an", "the", "find", "flag", "all", "that", "which", "is", "are", "in", "on", "of", "to", "and", "or", "not"]);

function slugify(intent: string): string {
  const words = intent.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim().split(/\s+/);
  const kept = words.filter(w => w && !STOP_WORDS.has(w)).slice(0, 5);
  return (kept.length ? kept : ["custom-doctor"]).join("-").slice(0, 60);
}

function usage(): void {
  console.log(BOLD + "any-doctor" + RESET + dim(" — your agent writes the analyzer, fixtures prove it, CI reruns it forever"));
  console.log("");
  console.log('  generate "<intent>" [--global]      print the exact prompt for your agent to build a doctor');
  console.log("  run [--all] [doctor.(m)js] [dir]   scan + report + interactive review + copy findings");
  console.log("  verify [--all] [doctor.(m)js]     fixture gate (no doctor: fuzzy picker; --all: every doctor)");
  console.log("");
  console.log(dim("doctors live in ./doctors/ (repo) and ~/.any-doctor/doctors/ (global)."));
  console.log(dim("generation delegates to your installed agent — run and verify never touch a model."));
}

async function main(): Promise<void> {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    fail("any-doctor requires Node >= 18 — you are running " + process.versions.node);
    process.exit(1);
  }
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);
  if (!cmd || cmd === "help" || cmd === "--help") return usage();
  if (cmd === "generate") return cmdGenerate(rest);
  if (cmd === "run") return cmdRun(rest);
  if (cmd === "verify") return cmdVerify(rest);
  fail("unknown command: " + cmd);
  usage();
  process.exit(1);
}

main().catch(e => {
  console.error(RED + (e && e.stack ? e.stack : String(e)) + RESET);
  process.exit(1);
});
