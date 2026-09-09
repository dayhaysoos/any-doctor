#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { DOCTOR_FILE_RE } from "./contract.js";
import { renderJson, renderReport, renderVerifyResult, RunOutcome, unsafeSkipLine } from "./report.js";
import { CohortSpec, runCohort } from "./cohort.js";
import { countsOfSeverities, FailOn, gateVerdict, GateVerdict, isFailOn } from "./gate.js";
import { DiffResult, runDiff } from "./diff.js";
import { deriveSummary } from "./summary.js";
import { copyToClipboard } from "./clipboard.js";
import { runDashboard } from "./dashboard.js";
import { brokenDoctors, BrokenDoctor, discoverDoctors, DiscoveredDoctor, globalDoctorsDir, resolveDoctorPath, unsafeSlugs, scopeLabel } from "./discover.js";
import { causeSummaryLine, describeRunnerError, isRunnerError, verifyDoctor } from "./runner.js";
import { scanDoctorFile, capabilitySummary } from "./capabilities.js";
import { selectDoctor, Selection } from "./select.js";
import { pickItemsOn } from "./picker.js";
import { formatMs, SpinnerHandle, startSpinner } from "./spinner.js";
import { canRunTui, processTtyEnv } from "./tty.js";

import { BOLD, CYAN, DIM, GREEN, RED, RESET, YELLOW } from "./palette.js";

function fail(msg: string): void {
  console.error(RED + msg + RESET);
}

function ok(msg: string): void {
  console.log(GREEN + msg + RESET);
}

function warn(msg: string): void {
  // Warnings are diagnostics, not output: stderr keeps stdout parseable
  // for --format json (standard CLI practice besides).
  console.error(YELLOW + msg + RESET);
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

// Commands compute exit codes; process.exit happens exactly once, in the
// direct-invocation guard at the bottom of this file. An ExitCode thrown
// mid-command aborts it with a code — main flattens it into its return
// value, so callers and tests always get a number, never a rejection.
class ExitCode extends Error {
  constructor(public code: number) {
    super("exit " + code);
  }
}

// Verify's crossing of the Runner seam: a failure there is a failure of
// the whole command, so it renders and aborts. (Run mode crosses the
// seam through the Cohort, whose crashes ride the RunOutcome as data.)
// Exit policy lives in this layer, never in the Runner.
async function runOrReport<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (e) {
    fail(isRunnerError(e) ? describeRunnerError(e) : String(e));
    throw new ExitCode(1);
  }
}

function warnBrokenDoctors(skipped: BrokenDoctor[]): void {
  for (const b of skipped) {
    console.log(YELLOW + "\u26a0 skipping broken doctor " + b.slug + RESET + dim(" — " + causeSummaryLine(b.cause)));
  }
}

function selectionOutcome(sel: Selection): { doctorPath: string } | { exit: number } {
  switch (sel.kind) {
    case "doctor":
      warnBrokenDoctors(sel.skipped);
      if (sel.unsafe.length > 0) warn("\u26a0 " + unsafeSkipLine(sel.unsafe));
      return { doctorPath: sel.doctorPath };
    case "not-found":
      fail(`no doctor program found for "${sel.arg}"`);
      fail(`searched ./doctors (walking up from ${process.cwd()}) and ~/.any-doctor/doctors`);
      return { exit: 1 };
    case "none-discovered":
      fail(`no doctors discovered in ${process.cwd()}/doctors or ~/.any-doctor/doctors`);
      fail('create one with: any-doctor generate "<intent>"');
      if (sel.unsafe.length > 0) warn("\u26a0 " + unsafeSkipLine(sel.unsafe));
      for (const b of sel.broken) fail("broken: " + b.slug + " — " + causeSummaryLine(b.cause));
      return { exit: 1 };
    case "non-interactive":
      warnBrokenDoctors(sel.skipped);
      if (sel.unsafe.length > 0) warn("\u26a0 " + unsafeSkipLine(sel.unsafe));
      console.log("available doctors:");
      for (const row of sel.rows) {
        console.log("  " + scopeLabel(row.scope).padEnd(7) + row.slug.padEnd(32) + dim(row.description));
      }
      fail("non-interactive session — specify a doctor path");
      return { exit: 1 };
    case "cancelled":
      return { exit: 0 };
  }
}

interface ParsedArgs {
  doctorPath?: string;
  targetDir: string;
  all: boolean;
  global: boolean;
  includeTests: boolean;
  // The Gate chapter (v1): output surface, exit policy, diff base.
  format: "report" | "json";
  failOn: FailOn;
  base?: string;
  // Set when a value-taking flag was passed without a usable value —
  // cmdRun refuses; a dangling --base must not silently mean "full mode".
  flagError?: string;
}

// An extensionless bare token is a doctor slug ONLY when it resolves in a
// scope (repo, global, bundled) - never merely because it looks like one,
// so `run src` still means the target directory unless a doctors/src.mjs
// exists somewhere. Scope precedence is resolveDoctorPath's law.
function isBareDoctorSlug(arg: string): boolean {
  if (path.basename(arg) !== arg || path.isAbsolute(arg)) return false;
  return resolveDoctorPath(arg, process.cwd()) !== null;
}

function parseArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = { targetDir: path.resolve("."), all: false, global: false, includeTests: false, format: "report", failOn: "none" };
  let targetDirSet = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--all") out.all = true;
    else if (a === "--global") out.global = true;
    else if (a === "--include-tests") out.includeTests = true;
    else if (a === "--fail-on" || a === "--format" || a === "--base") {
      // A value flag without a usable value is a refusal, not a silent
      // default: a dangling --base must never quietly mean "full mode".
      const v = args[i + 1];
      if (v === undefined || v.startsWith("--")) {
        out.flagError = `${a} needs a value`
          + (a === "--base" ? " (a git ref, e.g. --base main)" : a === "--fail-on" ? " (none, error, warning, or info)" : " (report or json)");
      } else {
        if (a === "--fail-on") out.failOn = v as FailOn;
        else if (a === "--format") out.format = v as "report" | "json";
        else out.base = v;
        i += 1;
      }
    }
    else if (out.doctorPath === undefined && (DOCTOR_FILE_RE.test(a) || isBareDoctorSlug(a))) out.doctorPath = a;
    else if (!targetDirSet) {
      out.targetDir = path.resolve(a);
      targetDirSet = true;
    }
  }
  return out;
}

// Discovery and the gate's partition, computed once per command — pure
// compute; rendering (broken warnings, skip notes) belongs to the callers,
// matching select.ts's compute/render split.
async function gatherDoctors(): Promise<{ valid: DiscoveredDoctor[]; skippedUnsafe: string[]; broken: BrokenDoctor[] }> {
  const all = await discoverDoctors(process.cwd());
  return {
    valid: all.filter(d => d.meta !== null),
    skippedUnsafe: unsafeSlugs(all),
    broken: brokenDoctors(all),
  };
}

// The batch commands' empty-cohort policy: no doctors at all is a setup
// error; only-skipped doctors are named and fail quietly. True means the
// caller returns 1.
function cohortUnusable(cohort: { valid: DiscoveredDoctor[]; skippedUnsafe: string[] }): boolean {
  if (cohort.valid.length > 0) return false;
  if (cohort.skippedUnsafe.length === 0) {
    fail("no doctors discovered — run from a directory with doctors/, or specify a doctor path");
  } else {
    warn("\u26a0 " + unsafeSkipLine(cohort.skippedUnsafe));
  }
  return true;
}

// A target that cannot be walked is a configuration error, not a doctor
// crash: refuse it before the picker opens or any child spawns, so the
// user gets one line instead of a loader stack trace.
function unusableTargetReason(targetDir: string): string | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(targetDir);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? "EUNKNOWN";
    if (code === "ENOENT") return `target directory not found: ${targetDir}`;
    return `cannot read target directory (${code}): ${targetDir}`;
  }
  if (!st.isDirectory()) return `target is not a directory: ${targetDir}`;
  return null;
}

// The live line's one gate: interactive TTYs get a spinner, headless and
// piped output stay byte-clean — the same gate family as the picker, in
// the one place both run paths share ("one defined meaning," as the
// glossary puts it, as a function instead of a copy-pasted condition).
// Exported for the gate's pin: a non-TTY stdio pair must construct
// nothing.
export function runSpinner(label: string, total: number): SpinnerHandle | null {
  const env = processTtyEnv();
  return canRunTui(env) && !process.env.ANY_DOCTOR_HEADLESS
    ? startSpinner(env.stdout, { label, total })
    : null;
}

// The one TUI-suppression gate, shared by the picker and the dashboard:
// --all is batch mode, --format json is a machine surface (frames on
// stdout would break parsing), headless/piped never paint. Before this
// lived as two hand-copied conditions — they had already diverged.
function wantsTui(parsed: ParsedArgs): boolean {
  const env = processTtyEnv();
  const cols = process.stdout.columns ?? 0;
  return !parsed.all && parsed.format !== "json"
    && canRunTui(env) && !process.env.ANY_DOCTOR_HEADLESS && (cols === 0 || cols >= 60);
}

// The exit law, once: crashes always fail (their lines name what's
// partial), the gate's bar judges findings, skips fail quietly. Each
// surface calls this where its timing wants the lines printed.
function exitAfterSurface(outcome: RunOutcome, gate: GateVerdict): number {
  if (outcome.crashed.length > 0) {
    for (const c of outcome.crashed) fail(`doctor crashed (results above are partial): ${c.id}`);
    return 1;
  }
  if (gate.fails) {
    fail(gate.reason ?? "gate failed");
    return 1;
  }
  return outcome.skippedUnsafe.length > 0 ? 1 : 0;
}

async function cmdRun(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (parsed.global) {
    fail("--global is a generate-only flag");
    return 1;
  }
  if (parsed.flagError !== undefined) {
    fail(parsed.flagError);
    return 1;
  }
  if (!isFailOn(parsed.failOn)) {
    fail(`--fail-on must be one of none, error, warning, info — got "${parsed.failOn}"`);
    return 1;
  }
  if (parsed.format !== "report" && parsed.format !== "json") {
    fail(`--format must be "report" or "json" — got "${parsed.format}"`);
    return 1;
  }
  const badTarget = unusableTargetReason(parsed.targetDir);
  if (badTarget !== null) {
    fail(badTarget);
    return 1;
  }

  // The command layer chooses the doctors — a path targets one, --all
  // and the no-argument default run the discovery cohort (a crash is
  // data — named, and it fails the command) — then hands them to the
  // Cohort, which owns everything from first spawn to last settle.
  let doctors: { id: string; programPath: string }[];
  let skippedUnsafe: string[];
  // The live line is mode-based, not count-based: an explicit path is a
  // scan of one (label + elapsed, no counts, no settle notes); picker
  // and --all are cohort runs (counts + per-settle notes) even when the
  // selection narrows to a single doctor.
  const explicitSingle = parsed.doctorPath !== undefined;

  if (parsed.doctorPath) {
    const sel = await selectDoctor(parsed.doctorPath, {
      cwd: process.cwd(),
      useColor: useColor(),
      env: processTtyEnv(),
    });
    const selection = selectionOutcome(sel);
    if ("exit" in selection) return selection.exit;
    // A path-selected doctor has no discovery id until it runs; the
    // basename names it — the same name the spinner and the crash
    // report use.
    doctors = [{ id: path.basename(selection.doctorPath, ".mjs"), programPath: selection.doctorPath }];
    skippedUnsafe = [];
  } else {
    const cohort = await gatherDoctors();
    warnBrokenDoctors(cohort.broken);
    if (cohortUnusable(cohort)) return 1;
    let valid = cohort.valid;
    skippedUnsafe = cohort.skippedUnsafe;
    // The cold start is opt-in: the selector opens with nothing
    // pre-selected, space selects, a selects every filtered row, and
    // Enter runs the selection — narrowing to one doctor is one space,
    // not nine deselects (D15 amendment 2026-09-08 — the pack outgrew
    // the no-picker flow).
    // --all, headless, and non-TTY never see a prompt.
    if (wantsTui(parsed)) {
      const chosen = await pickItemsOn(processTtyEnv(), valid.map(d => ({
        id: d.meta!.id,
        label: d.meta!.id,
        sub: [scopeLabel(d.scope), d.meta!.description].filter(Boolean).join(" · "),
      })), useColor());
      if (chosen === null) return 0; // esc — nothing ran, nothing to report
      const keep = new Set(chosen.map(it => it.id));
      valid = valid.filter(d => keep.has(d.meta!.id));
    }
    doctors = valid.map(d => ({ id: d.meta!.id, programPath: d.path }));
  }

  // The live line: while the cohort's children run, a spinner instead
  // of frozen silence. stop() sits in finally: even a defect that
  // rejects the batch must not leave a hidden cursor behind. Settle
  // notes name doctors by the spec's ids — one naming rule, shared with
  // the crash report.
  const spec: CohortSpec = { doctors, targetDir: parsed.targetDir, includeTests: parsed.includeTests };
  const idOf = new Map(doctors.map(d => [d.programPath, d.id]));
  // JSON mode paints nothing on stdout — not even the live line. The
  // picker and dashboard get the same refusal from wantsTui; the
  // spinner's gate is here.
  const spin = parsed.format === "json"
    ? null
    : runSpinner(
      explicitSingle ? `scanning with ${doctors[0].id}` : "running doctors",
      explicitSingle ? 0 : doctors.length,
    );
  let done = 0;
  let ran;
  try {
    ran = await runCohort(
      spec,
      spin && !explicitSingle
        ? (p) => {
          done += 1;
          // A healthy settle carries its own duration; a crash carries
          // none (the runner reports 0) — showing "0ms" would fabricate
          // a duration that was never measured.
          const who = idOf.get(p.programPath) ?? "doctor";
          spin.update({ done, note: p.ok ? `${who} ${formatMs(p.durationMs)}` : `${who} ✗` });
        }
        : undefined,
    );
  } finally {
    spin?.stop();
  }
  // Crash detail prints before any surface: "details above" in the
  // report's every-crashed line stays true, and the dashboard's own
  // rendering (findings and skips, not crashes) stays clean.
  for (const c of ran.crashed) fail(c.detail);
  const outcome: RunOutcome = { ...ran, skippedUnsafe };
  const summary = deriveSummary(outcome);

  // Diff mode exists iff --base was passed AND the HEAD scan is whole:
  // a crashed HEAD doctor contributes no findings, so its base findings
  // would surface as "resolved" — the same dishonesty as a partial
  // base, on the other side. The crash already fails the run.
  let diff: DiffResult | undefined;
  if (parsed.base !== undefined && outcome.crashed.length === 0) {
    try {
      diff = await runDiff(spec, parsed.base, summary.groups);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
      return 1;
    }
  }

  // The Gate: advisory findings by default (--fail-on none), crashes
  // and skips always fail, diff mode judges only what the change
  // ADDED.
  const gate = gateVerdict(
    parsed.failOn,
    diff !== undefined ? countsOfSeverities(diff.added.map(a => a.severity)) : summary.severityCounts,
    diff !== undefined ? "diff" : "full",
  );

  // Report-vs-dashboard policy: --all is the batch/report mode; JSON is
  // a machine surface and never opens a TUI; otherwise a real terminal
  // with room and no headless override gets the tree.
  const interactive = wantsTui(parsed);

  // The machine surface: exactly one JSON object on stdout, diagnostics
  // on stderr, the gate verdict data not prose.
  if (parsed.format === "json") {
    console.log(renderJson(outcome, summary, gate, diff));
    return exitAfterSurface(outcome, gate);
  }

  if (!interactive) {
    console.log(renderReport(outcome, useColor(), diff !== undefined
      ? { base: diff.base, added: diff.added.length, resolved: diff.resolved.length }
      : undefined));
    return exitAfterSurface(outcome, gate);
  }

  const invoker = process.argv[1] ? `node "${fs.realpathSync(process.argv[1])}"` : "any-doctor";

  // Crashes are named before the dashboard paints — the dashboard itself
  // renders findings and skips, not crashes — and the dashboard ignores
  // diff mode: it is the review experience, not the gate.
  const code = exitAfterSurface(outcome, gate);
  await runDashboard({ outcome, invoker, useColor: useColor() });
  return code;
}

async function cmdVerify(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (parsed.global) {
    fail("--global is a generate-only flag");
    return 1;
  }
  if (parsed.includeTests) {
    warn("--include-tests applies to run only — verify always scans everything its fixtures seed");
  }
  if (parsed.flagError !== undefined) {
    fail(parsed.flagError);
    return 1;
  }
  if (parsed.failOn !== "none" || parsed.format !== "report" || parsed.base !== undefined) {
    fail("--fail-on, --format, and --base are run-only flags — the fixture gate is the doctor's own verdict");
    return 1;
  }

  if (parsed.all) {
    const cohort = await gatherDoctors();
    warnBrokenDoctors(cohort.broken);
    if (cohort.skippedUnsafe.length > 0) warn("\u26a0 " + unsafeSkipLine(cohort.skippedUnsafe));
    if (cohortUnusable(cohort)) return 1;
    const discovered = cohort.valid;
    const skippedUnsafe = cohort.skippedUnsafe;
    let totalFailures = 0;
    const crashed: string[] = [];
    for (const d of discovered) {
      console.log(BOLD + d.meta!.id + RESET);
      console.log(DIM + "  capabilities: " + capabilitySummary(scanDoctorFile(d.path)) + RESET);
      try {
        const r = await runOrReport(verifyDoctor({ programPath: d.path }));
        console.log(renderVerifyResult(r, useColor()));
        totalFailures += r.results.filter(x => !x.ok).length;
      } catch (e) {
        if (!(e instanceof ExitCode)) throw e;
        console.log(RED + "  crashed — skipped" + RESET);
        crashed.push(d.meta!.id);
      }
      console.log("");
    }
    if (totalFailures > 0 || crashed.length > 0 || skippedUnsafe.length > 0) {
      const parts: string[] = [];
      if (totalFailures > 0) parts.push(totalFailures + " fixture(s) failed");
      if (crashed.length > 0) parts.push(crashed.length + " doctor(s) crashed: " + crashed.join(", "));
      if (skippedUnsafe.length > 0) parts.push(unsafeSkipLine(skippedUnsafe));
      fail(parts.join("; "));
      return 1;
    }
    ok("all doctors fixture-green");
    return 0;
  }

  const sel = await selectDoctor(parsed.doctorPath, {
    cwd: process.cwd(),
    useColor: useColor(),
    allowPicker: !process.env.ANY_DOCTOR_HEADLESS,
    env: processTtyEnv(),
  });
  const outcome = selectionOutcome(sel);
  if ("exit" in outcome) return outcome.exit;

  console.log(DIM + "capabilities: " + capabilitySummary(scanDoctorFile(outcome.doctorPath)) + RESET);
  const result = await runOrReport(verifyDoctor({ programPath: outcome.doctorPath }));
  console.log(renderVerifyResult(result, useColor()));
  const failures = result.results.filter(x => !x.ok).length;
  console.log("");
  const skipped = result.results.filter((x) => x.skipped !== undefined).length;
  const passed = result.results.filter((x) => x.ok && x.skipped === undefined).length;
  console.log(dim(
    `${passed}/${result.results.length} fixtures passed for ${result.meta.id}`
    + (skipped > 0 ? ` — ${skipped} skipped (analysis engine unavailable)` : ""),
  ));
  return failures > 0 ? 1 : 0;
}

// The planted copy of the skill once went three decisions stale
// (doctors/AGENTS.md still taught "builtins allowed" after Confinement
// refused every import), so planting refreshes: a copy any-doctor planted
// carries the provenance marker and is overwritten on generate; a copy
// without it is the user's and is never touched.
const PLANT_MARKER = "<!-- any-doctor skill plant -->\n";

export function plantSkill(scopeDir: string, skill: string): "planted" | "refreshed" | "left-user-copy" {
  const agentsPath = path.join(scopeDir, "AGENTS.md");
  const existing = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf8") : null;
  if (existing === null || existing.startsWith(PLANT_MARKER)) {
    fs.writeFileSync(agentsPath, PLANT_MARKER + skill);
    return existing === null ? "planted" : "refreshed";
  }
  return "left-user-copy";
}

async function cmdGenerate(args: string[]): Promise<number> {
  let intent: string | undefined;
  let global = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--global") global = true;
    else if (intent === undefined) intent = args[i];
  }
  if (!intent) {
    fail('usage: any-doctor generate "<one-line intent>" [--global]');
    return 1;
  }
  const skill = skillText();
  if (skill === null) {
    fail("generation skill not found (skill/any-doctor.skill.md missing).");
    return 1;
  }

  const slug = slugify(intent);
  const scopeDir = global
    ? (fs.mkdirSync(globalDoctorsDir(), { recursive: true }), globalDoctorsDir())
    : path.resolve("doctors");
  fs.mkdirSync(scopeDir, { recursive: true });

  const planted = plantSkill(scopeDir, skill);
  if (planted === "left-user-copy") {
    warn("AGENTS.md exists with edits of your own — left untouched (delete it to re-plant)");
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
    "Then run the skill's adversarial pass (Hard workflow, step 4): attack",
    "your own doctor with a counter-fixture wave — lookalikes, same-line",
    "variants, semantic traps — and verify again until it survives.",
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
  return 0;
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
  console.log("  run [--all] [--include-tests] [doctor.(m)js] [dir]   scan; no argument = every doctor in one review tree");
  console.log("  verify [--all] [doctor.(m)js]     fixture gate (no doctor: fuzzy picker; --all: every doctor)");
  console.log("");
  console.log(dim("doctors live in ./doctors/ (repo), ~/.any-doctor/doctors/ (global), and the bundled pack (lowest priority)."));
  console.log(dim("generation delegates to your installed agent — run and verify never touch a model."));
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    fail("any-doctor requires Node >= 18 — you are running " + process.versions.node);
    return 1;
  }
  const cmd = argv[0];
  const rest = argv.slice(1);
  if (cmd === "help" || cmd === "--help") {
    usage();
    return 0;
  }
  // D15: bare `npx any-doctor` is the cold start — every discovered
  // doctor (bundled included), straight into the report/tree, no usage
  // wall. `help` remains the explicit usage door.
  if (!cmd) return await cmdRun(rest);
  try {
    if (cmd === "generate") return await cmdGenerate(rest);
    if (cmd === "run") return await cmdRun(rest);
    if (cmd === "verify") return await cmdVerify(rest);
  } catch (e) {
    if (e instanceof ExitCode) return e.code;
    throw e;
  }
  fail("unknown command: " + cmd);
  usage();
  return 1;
}

// Direct-invocation guard (realpath-aware so npm link's symlinks still run):
// importing this module never executes the CLI — commands are testable
// through main(argv).
const invokedDirectly = (() => {
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  // exitCode, never process.exit: a piped stdout drains asynchronously,
  // and process.exit() cuts it off at the pipe-buffer boundary — a
  // 134KB --format json payload arrived 64KB-truncated on a real repo.
  // Setting exitCode lets Node flush every stream, then exit itself.
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(RED + (e && e.stack ? e.stack : String(e)) + RESET);
      process.exitCode = 1;
    },
  );
}
