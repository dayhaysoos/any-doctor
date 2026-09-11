#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { DOCTOR_FILE_RE } from "./contract.js";
import { renderJson, renderReport, renderVerifyResult, reportDiffOf, unsafeSkipLine } from "./report.js";
import { readKeyFor, resolveFinding, RunOutcome } from "./contract.js";
import { CohortSpec, runCohort } from "./cohort.js";
import { countsOfSeverities, FailOn, gateVerdict, GateVerdict, isFailOn } from "./gate.js";
import { DiffResult, runDiff } from "./diff.js";
import { digestTextFile, doctorDigests } from "./identity.js";
import { decisionsPath, loadDecisions, DecisionRecord, recordDecision, reverseDecision, decodeDecisionKey, encodeDecisionKey } from "./finding-state.js";
import { ReviewView, reviewOf, ScanProvenance } from "./review.js";
import { captureScan, identityKeyOf } from "./scan-capture.js";
import { deriveSummary } from "./summary.js";
import { copyToClipboard } from "./clipboard.js";
import { runDashboard } from "./dashboard.js";
import { brokenDoctors, BrokenDoctor, discoverDoctors, DiscoveredDoctor, globalDoctorsDir, resolveDoctorPath, unsafeSlugs, scopeLabel } from "./discover.js";
import { causeSummaryLine, describeRunnerError, isRunnerError, metaDoctor, verifyDoctor } from "./runner.js";
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

// The agent usage doc — the machine-facing interface, printable on demand
// (`any-doctor help agents`) so npx-only users need no installation to
// discover it. Shipped in the package; always in sync with the version
// that printed it.
function agentUsageText(): string | null {
  const p = fileURLToPath(new URL("../skill/agent-usage.md", import.meta.url));
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

// ---- remembered decisions (M2) ------------------------------------------
//
// Local decisions suppress findings from the ACTIVE list (report display,
// dashboard tree) when the identity key matches exactly; gates and exit
// codes stay on the RAW findings — a private decision never changes CI
// (that is M3's project scope). Evidence-changed findings resurface with
// a reassessment warning; a corrupt decisions file fails the run loudly
// rather than silently ignoring the user's records.



// The JSON adapter over the view: per-readKey rows carry the printable
// key (decision only where applied); the decisions block renders only
// when it has content — renderJson decides from this payload.
function jsonReviewOf(view: ReviewView): import("./report.js").JsonReview {
  const annotations: import("./report.js").JsonReview["annotations"] = new Map();
  for (const [readKey, row] of view.rows) {
    annotations.set(readKey, {
      ...(row.key !== undefined ? { decisionKey: row.key } : {}),
      ...(row.decision !== undefined ? { decision: row.decision } : {}),
      ...(row.stale === true ? { stale: true } : {}),
    });
  }
  return {
    annotations,
    reassessing: view.reassessing,
    ambiguous: view.ambiguous.map((a) => ({ checkKey: a.checkKey, file: a.file, occurrences: a.occurrences })),
    dormant: view.dormant,
  };
}

// The command layer's adapter: one ReviewView, surfaces read it. The
// derivation lives in review.ts — one derivation, N adapters.
function computeReview(targetDir: string, capture: ReturnType<typeof captureScan>, provenance: ScanProvenance, load = loadDecisions): { ok: true; review: ReviewView } | { ok: false; error: string } {
  const loaded = load(targetDir);
  if (!loaded.ok) return loaded;
  return { ok: true, review: reviewOf(capture, loaded.decisions, encodeDecisionKey, provenance) };
}

// The scan's doctor provenance: program digests from the spec (the same
// pre-scan digest discipline the diff uses) — the command layer alone
// holds program paths.
function scanProvenanceOf(spec: CohortSpec, groups: { meta: { id: string; checks?: { id: string; revision?: number }[] } }[]): ScanProvenance {
  const digests = doctorDigests(spec.doctors, digestTextFile);
  const programDigests = new Map(digests.map((d) => [d.doctorId, d.digest]));
  const revisions = new Map<string, number>();
  for (const g of groups) {
    for (const check of g.meta.checks ?? []) {
      if (check.revision !== undefined) revisions.set(`${g.meta.id}/${check.id}`, check.revision);
    }
  }
  return { revisions, programDigests };
}

// The display outcome: decided findings removed, everything else the raw
// truth. The report and dashboard render this; the gate renders raw.
function outcomeWithoutDecided(outcome: RunOutcome, suppressedReadKeys: Set<string>): RunOutcome {
  if (suppressedReadKeys.size === 0) return outcome;
  const groups = outcome.groups.map((g) => ({
    ...g,
    findings: g.findings.filter((f) => {
      const j = resolveFinding(g.meta, f);
      return !suppressedReadKeys.has(readKeyFor(j.checkKey, f.file, f.line, f.column));
    }),
  }));
  return { ...outcome, groups };
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
  // stderr, always: a console.log here put the warning INSIDE --format
  // json stdout, corrupting the machine surface (agent-review probe).
  for (const b of skipped) {
    warn("\u26a0 skipping broken doctor " + b.slug + dim(" — " + causeSummaryLine(b.cause)));
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
function exitAfterSurface(outcome: RunOutcome, gate: GateVerdict, brokenCount = 0): number {
  if (outcome.crashed.length > 0) {
    for (const c of outcome.crashed) fail(`doctor crashed (results above are partial): ${c.id}`);
    return 1;
  }
  if (gate.fails) {
    fail(gate.reason ?? "gate failed");
    return 1;
  }
  return outcome.skippedUnsafe.length > 0 || brokenCount > 0 ? 1 : 0;
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
  let broken: BrokenDoctor[] = [];
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
    broken = sel.kind === "doctor" ? sel.skipped : [];
  } else {
    const cohort = await gatherDoctors();
    warnBrokenDoctors(cohort.broken);
    if (cohortUnusable(cohort)) return 1;
    let valid = cohort.valid;
    skippedUnsafe = cohort.skippedUnsafe;
    broken = cohort.broken;
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
  const spec: CohortSpec = { doctors, targetDir: parsed.targetDir, includeTests: parsed.includeTests, skippedUnsafe, broken };
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
  // Diff provenance is captured BEFORE the head scan: the digests must
  // describe the bytes that were about to run (a post-hoc read cannot
  // tell two executions apart — see identity.ts).
  const headDigests = parsed.base !== undefined ? doctorDigests(spec.doctors, digestTextFile) : undefined;
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
  // Broken doctors fail ALWAYS, like crashes: a doctor whose program
  // cannot even be read is an infrastructure failure, and a local broken
  // file shadowing a bundled doctor must never read as that doctor
  // scanning clean (the agent-review probe: exit 0, score 100).
  for (const b of broken) {
    warn("\u26a0 broken doctor " + b.slug + " — " + causeSummaryLine(b.cause));
  }

  // Crash detail prints before any surface: "details above" in the
  // report's every-crashed line stays true, and the dashboard's own
  // rendering (findings and skips, not crashes) stays clean.
  for (const c of ran.crashed) fail(c.detail);
  const outcome: RunOutcome = ran;
  const summary = deriveSummary(outcome);

  // Diff mode exists iff --base was passed AND the HEAD scan is whole:
  // a crashed HEAD doctor contributes no findings, so its base findings
  // would surface as "resolved" — the same dishonesty as a partial
  // base, on the other side. The crash already fails the run. The head
  // capture is taken HERE, at scan-adjacency: evidence bytes are read
  // once, before anything else can touch the working tree.
  let diff: DiffResult | undefined;
  if (parsed.base !== undefined && outcome.crashed.length === 0) {
    try {
      const head = captureScan(spec.targetDir, summary.groups, outcome.analysisAvailable ?? false, headDigests!);
      diff = await runDiff(spec, parsed.base, head);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
      return 1;
    }
  }

  // Report-vs-dashboard policy: --all is the batch/report mode; JSON is
  // a machine surface and never opens a TUI; otherwise a real terminal
  // with room and no headless override gets the tree.
  const interactive = wantsTui(parsed);

  // Remembered decisions: computed when state exists (headless) or when
  // the dashboard may record one (it needs the identity keys either way).
  // A corrupt file fails the run loudly — never ignored, never reset.
  let review: ReviewView | undefined;
  // JSON is the agent surface: findings carry decisionKey from the very
  // first run, so agents decide without a resolving scan.
  if (fs.existsSync(decisionsPath(parsed.targetDir)) || interactive || parsed.format === "json") {
    const capture = captureScan(parsed.targetDir, summary.groups, outcome.analysisAvailable ?? false, []);
    const provenance = scanProvenanceOf(spec, summary.groups);
    const r = computeReview(parsed.targetDir, capture, provenance);
    if (!r.ok) {
      fail(r.error);
      return 1;
    }
    review = r.review;
  }

  // The Gate: advisory findings by default (--fail-on none), crashes
  // and skips always fail, diff mode judges only what the change
  // ADDED.
  const gate = gateVerdict(
    parsed.failOn,
    diff !== undefined ? countsOfSeverities(diff.added.map(a => a.severity)) : summary.severityCounts,
    diff !== undefined ? "diff" : "full",
  );

  // The machine surface: exactly one JSON object on stdout, diagnostics
  // on stderr, the gate verdict data not prose.
  // Surfaces carry decision info only when there is any — an emptied
  // store (last decision reversed) leaves no machinery behind.
  const reviewActive = review !== undefined
    && (review.accepted + review.notApplicable > 0
      || review.reassessing.length > 0
      || review.ambiguous.length > 0);

  if (parsed.format === "json") {
    console.log(renderJson(outcome, summary, gate, diff, review !== undefined ? jsonReviewOf(review) : undefined, broken.map(b => ({ id: b.slug, detail: causeSummaryLine(b.cause) }))));
    return exitAfterSurface(outcome, gate, broken.length);
  }

  if (!interactive) {
    // Agents and pipes get one pointer to the machine surface — stderr,
    // so JSON purity and report pipes are untouched. The TTY check keeps
    // terminal humans (whose stdout IS a tty) free of it.
    if (parsed.format === "report" && !process.stdout.isTTY) {
      warn(dim("any-doctor: non-interactive output — agents: run with --format json (findings carry decisionKey); the full workflow: any-doctor help agents"));
    }
    // The report renders the ACTIVE list: decided findings are hidden,
    // with the reviewed line keeping the hiding honest. The gate above
    // still judged the raw findings — local decisions never change CI.
    console.log(renderReport(
      outcomeWithoutDecided(outcome, review?.suppressedReadKeys ?? new Set()),
      useColor(),
      diff !== undefined ? reportDiffOf(diff) : undefined,
      reviewActive && review !== undefined
        ? { accepted: review.accepted, notApplicable: review.notApplicable,
            reassessing: review.reassessing, ambiguous: review.ambiguous }
        : undefined,
    ));
    return exitAfterSurface(outcome, gate, broken.length);
  }

  const invoker = process.argv[1] ? `node "${fs.realpathSync(process.argv[1])}"` : "any-doctor";

  // Crashes are named before the dashboard paints — the dashboard itself
  // renders findings and skips, not crashes — and the dashboard ignores
  // diff mode: it is the review experience, not the gate.
  const code = exitAfterSurface(outcome, gate);
  const stateExistedBeforeDashboard = fs.existsSync(decisionsPath(parsed.targetDir));
  await runDashboard({
    outcome,
    invoker,
    useColor: useColor(),
    ...(review !== undefined ? { view: review } : {}),
  });
  if (!stateExistedBeforeDashboard && fs.existsSync(decisionsPath(parsed.targetDir))) {
    console.log(dim("tip: add the agent workflow to this repo's AGENTS.md so your agents use decisions — 'any-doctor help agents' prints ready-to-paste markdown"));
  }
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
    + (skipped > 0 ? ` — ${skipped} not exercised (see reasons above)` : ""),
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

// ---- decide / decisions: remembering and reversing -----------------------

interface DecideArgs {
  key?: string;
  file?: string;
  line?: number;
  check?: string;
  disposition?: "accepted" | "not-applicable";
  reason?: string;
  actor: string;
  doctorPath?: string;
  targetDir: string;
  all: boolean;
}

function parseDecideArgs(args: string[]): DecideArgs | { error: string } {
  const out: DecideArgs = { actor: "cli", targetDir: path.resolve("."), all: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const v = args[i + 1];
    if (a === "--key" || a === "--file" || a === "--check" || a === "--reason" || a === "--actor") {
      if (v === undefined || v.startsWith("--")) return { error: `${a} needs a value` };
      if (a === "--key") out.key = v;
      else if (a === "--file") out.file = v;
      else if (a === "--check") out.check = v;
      else if (a === "--reason") out.reason = v;
      else out.actor = v;
      i += 1;
    } else if (a === "--line") {
      if (v === undefined || !/^\d+$/.test(v)) return { error: "--line needs a numeric value" };
      out.line = Number(v);
      i += 1;
    } else if (a === "--accepted") out.disposition = "accepted";
    else if (a === "--not-applicable") out.disposition = "not-applicable";
    else if (a === "--all") out.all = true;
    else if (out.doctorPath === undefined && (DOCTOR_FILE_RE.test(a) || isBareDoctorSlug(a))) out.doctorPath = a;
    else if (out.targetDir === path.resolve(".")) out.targetDir = path.resolve(a);
    else return { error: `unexpected argument: ${a}` };
  }
  if (out.disposition === undefined) return { error: "choose --accepted or --not-applicable" };
  if (out.reason === undefined || out.reason.trim() === "") return { error: "--reason is required — a decision without a reason is a suppression" };
  if (out.key === undefined && (out.file === undefined || out.line === undefined)) {
    return { error: "pass --key <decisionKey from a scan's JSON>, or --file and --line to resolve against a fresh scan" };
  }
  return out;
}

async function cmdDecide(args: string[]): Promise<number> {
  const parsed = parseDecideArgs(args);
  if ("error" in parsed) {
    fail("any-doctor decide: " + parsed.error);
    return 1;
  }
  let key = parsed.key;
  let scanProvenanceAtDecide: { revision?: number; programDigest?: string } | undefined;
  if (key !== undefined) {
    // Keys cross shells as base64url (raw keys contain NUL separators
    // that cannot traverse argv). A non-decodable value only matches if
    // some record literally holds it — otherwise refuse loudly.
    const decoded = decodeDecisionKey(key);
    if (decoded === null) {
      const raw = loadDecisions(parsed.targetDir);
      const exact = raw.ok && raw.decisions.some((d) => d.key === key);
      if (!exact) {
        fail("any-doctor decide: --key expects the base64url decisionKey a scan's JSON or 'any-doctor decisions' prints");
        return 1;
      }
    } else {
      key = decoded;
    }
  }

  if (scanProvenanceAtDecide === undefined && parsed.key !== undefined && key !== undefined) {
    // --key decisions still record what runs NOW: the decision names a
    // checkKey, whose doctor is discoverable by id — digest its current
    // program so a later changed doctor resurfaces this decision (the
    // agent flow's version of the resolving scan's provenance).
    const doctorId = key.split("\u0000")[0]?.split("/")[0];
    // An explicit doctor path wins (the caller knows what ran); else
    // discover by the id the checkKey names.
    const slug = parsed.doctorPath !== undefined
      ? path.resolve(process.cwd(), parsed.doctorPath)
      : doctorId !== undefined ? resolveDoctorPath(doctorId, process.cwd()) : null;
    if (slug !== null) {
      const bytes = digestTextFile(slug);
      // Prefer the check's declared semantic revision (the churn escape):
      // a --key decision must survive cosmetic doctor edits exactly like
      // a scan-resolved one — digest-only recording churned (smoke catch).
      const metaRead = await metaDoctor({ programPath: slug });
      const checkId = key.split("\u0000")[0]?.split("/")[1];
      const declared = metaRead.meta?.checks?.find(ch => ch.id === checkId)?.revision;
      scanProvenanceAtDecide = declared !== undefined
        ? { revision: declared }
        : { programDigest: doctorDigests([{ id: doctorId ?? "x", programPath: slug }], () => bytes)[0].digest };
    }
  }
  let checkKey = "";
  if (key === undefined) {
    // Resolve by scanning: the decision must attach to the evidence a
    // finding has NOW, so --file/--line re-runs the doctors first.
    const badTarget = unusableTargetReason(parsed.targetDir);
    if (badTarget !== null) {
      fail(badTarget);
      return 1;
    }
    let doctors: { id: string; programPath: string }[];
    if (parsed.doctorPath) {
      const sel = await selectDoctor(parsed.doctorPath, { cwd: process.cwd(), useColor: useColor(), env: processTtyEnv() });
      const selection = selectionOutcome(sel);
      if ("exit" in selection) return selection.exit;
      doctors = [{ id: path.basename(selection.doctorPath, ".mjs"), programPath: selection.doctorPath }];
    } else {
      const cohort = await gatherDoctors();
      warnBrokenDoctors(cohort.broken);
      if (cohortUnusable(cohort)) return 1;
      let valid = cohort.valid;
      if (!parsed.all && valid.length > 1) {
        fail("multiple doctors discovered — pass a doctor path (or --all) so the resolving scan matches what you ran");
        return 1;
      }
      doctors = valid.map((d) => ({ id: d.meta!.id, programPath: d.path }));
    }
    const spec: CohortSpec = { doctors, targetDir: parsed.targetDir, includeTests: false, skippedUnsafe: [] };
    const ran = await runCohort(spec);
    if (ran.crashed.length > 0) {
      for (const c of ran.crashed) fail(c.detail);
      fail("any-doctor decide: the resolving scan crashed — a decision attaches to evidence, and there is none");
      return 1;
    }
    const groups = deriveSummary(ran).groups;
    const capture = captureScan(parsed.targetDir, groups, ran.analysisAvailable ?? false, []);
    const scanProv = scanProvenanceOf(spec, deriveSummary(ran).groups);
    const view = reviewOf(capture, [], encodeDecisionKey, scanProv);
    const candidates = capture.entries
      .map((e) => ({ e, key: view.rawKeyByReadKey.get(readKeyFor(e.checkKey, e.f.file, e.f.line, e.f.column)) ?? "", row: view.rows.get(readKeyFor(e.checkKey, e.f.file, e.f.line, e.f.column)) }))
      .filter((c2) => c2.row?.stale !== true)
      .filter(({ e }) => e.f.file === parsed.file && e.f.line === parsed.line
        && (parsed.check === undefined || e.checkKey === parsed.check || e.f.rule === parsed.check || e.checkKey.endsWith("/" + parsed.check)));
    if (candidates.length === 0) {
      fail(`no current finding at ${parsed.file}:${parsed.line}${parsed.check !== undefined ? " for " + parsed.check : ""} — findings move; run a scan and use its decisionKey`);
      return 1;
    }
    const distinct = new Set(candidates.map((c) => c.e.checkKey));
    if (distinct.size > 1) {
      fail(`multiple findings at ${parsed.file}:${parsed.line} — pass --check: ${[...distinct].join(", ")}`);
      return 1;
    }
    key = candidates[0].key;
    checkKey = candidates[0].e.checkKey;
    const rev = scanProv.revisions.get(checkKey);
    const doctorId = checkKey.split("/")[0];
    scanProvenanceAtDecide = {
      ...(rev !== undefined ? { revision: rev } : { programDigest: scanProv.programDigests.get(doctorId) }),
    };
  }
  // With --key, checkKey and file come from the DECODED key itself (its
  // first two NUL-separated fields); line is display-only and unknown
  // here (0). Splitting the encoded argv form would store the whole
  // blob as checkKey and the decision would sit dormant forever
  // (loop-4's catch).
  const [keyCheck, keyFile] = key!.split("\u0000");
  const stateExistedBefore = fs.existsSync(decisionsPath(parsed.targetDir));
  const recorded = recordDecision(parsed.targetDir, {
    key: key!,
    checkKey: checkKey !== "" ? checkKey : keyCheck,
    file: parsed.file ?? keyFile ?? "",
    line: parsed.line ?? 0,
    disposition: parsed.disposition!,
    reason: parsed.reason!,
    actor: parsed.actor,
    // Scan-resolved decisions record what ran (revision-or-digest);
    // --key decisions carry no provenance the command can see — later
    // scans treat absence as incompatible until re-decided (visible).
    ...(scanProvenanceAtDecide !== undefined ? { provenance: scanProvenanceAtDecide } : {}),
  });
  if (!recorded.ok) {
    fail(recorded.error);
    return 1;
  }
  ok(`decision recorded (${parsed.disposition}): ${truncReason(parsed.reason!)} — hidden from the active list on the next scan; any-doctor decisions --reverse <key> to undo`);
  if (!stateExistedBefore) {
    // The one-time adoption nudge: the highest-trust channel for agents
    // is the repo's own AGENTS.md — we never write it; we point at the
    // paste source.
    console.log(dim("tip: add the agent workflow to this repo's AGENTS.md so your agents use decisions — 'any-doctor help agents' prints ready-to-paste markdown"));
  }
  return 0;
}

function truncReason(s: string): string {
  return s.length <= 60 ? s : s.slice(0, 59) + "…";
}

async function cmdDecisions(args: string[]): Promise<number> {
  let targetDir = path.resolve(".");
  let reverse: string | undefined;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") json = true;
    else if (a === "--reverse") {
      const v = args[i + 1];
      if (v === undefined || v.startsWith("--")) { fail("--reverse needs a decision key (any-doctor decisions lists them)"); return 1; }
      reverse = v;
      i += 1;
    } else if (a.startsWith("--")) {
      fail(`any-doctor decisions: unknown flag ${a} (known: --json, --reverse <key>)`);
      return 1;
    } else targetDir = path.resolve(a);
  }
  const loaded = loadDecisions(targetDir);
  if (!loaded.ok) {
    fail(loaded.error);
    return 1;
  }
  if (reverse !== undefined) {
    const r = reverseByKey(targetDir, reverse);
    if (!r.ok) {
      fail(r.error);
      return 1;
    }
    ok("decision reversed — the finding returns to the active list on the next scan");
    return 0;
  }
  if (json) {
    // Machine surface: JSON in EVERY state (empty included — prose here
    // broke parsers), keys shell-safe (base64url, matching decisionKey —
    // raw keys hold NULs argv cannot carry).
    console.log(JSON.stringify({
      schema: 1,
      decisions: loaded.decisions.map((d) => ({ ...d, key: encodeDecisionKey(d.key) })),
    }, null, 2));
    return 0;
  }
  if (loaded.decisions.length === 0) {
    console.log(dim("no decisions recorded — they are created from the dashboard (a/x) or any-doctor decide"));
    return 0;
  }
  // Bounded output: a wall of decisions is a denial of service on the
  // reader; --json is the unbounded export path.
  const LIST_CAP = 500;
  for (const d of loaded.decisions.slice(0, LIST_CAP)) {
    console.log(`${d.disposition === "accepted" ? "✓ accepted" : "⊘ not-applicable"}  ${d.checkKey}  ${d.file}:${d.line}`);
    console.log(dim(`  reason: ${d.reason}`));
    console.log(dim(`  actor: ${d.actor} · updated ${d.updatedAt} · key: ${encodeDecisionKey(d.key)}`));
  }
  if (loaded.decisions.length > LIST_CAP) {
    console.log(dim(`… and ${loaded.decisions.length - LIST_CAP} more — any-doctor decisions --json`));
  }
  return 0;
}

// Reverse by exact key or a unique prefix (full identity keys are long).
function reverseByKey(targetDir: string, key: string): { ok: true } | { ok: false; error: string } {
  const loaded = loadDecisions(targetDir);
  if (!loaded.ok) return loaded;
  // The printed keys are base64url-encoded (raw keys hold NULs argv
  // cannot carry); match encoded-prefix-unique, encoded-exact, or raw.
  const candidates: string[] = [];
  const decoded = decodeDecisionKey(key);
  if (decoded !== null) candidates.push(decoded);
  candidates.push(key);
  for (const candidate of candidates) {
    const exact = loaded.decisions.find((d) => d.key === candidate);
    if (exact !== undefined) return reverseDecision(targetDir, exact.key);
  }
  for (const candidate of candidates) {
    const prefixed = loaded.decisions.filter((d) => encodeDecisionKey(d.key).startsWith(candidate) || d.key.startsWith(candidate));
    if (prefixed.length === 1) return reverseDecision(targetDir, prefixed[0].key);
    if (prefixed.length > 1) return { ok: false, error: `key prefix is ambiguous (${prefixed.length} decisions) — use more characters` };
  }
  return { ok: false, error: "no decision matches that key — any-doctor decisions lists them (copy the printed key)" };
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
  console.log("  decide (--key K | --file F --line N [--check C]) (--accepted|--not-applicable) --reason R");
  console.log("                                    record a decision on a finding (resolves by scanning unless --key)");
  console.log("  decisions [dir] [--json] [--reverse K]   list remembered decisions; reverse one");
  console.log("");
  console.log(dim("doctors live in ./doctors/ (repo), ~/.any-doctor/doctors/ (global), and the bundled pack (lowest priority)."));
  console.log(dim("generation delegates to your installed agent — run and verify never touch a model."));
  console.log(dim("agents: 'any-doctor help agents' prints the machine interface (JSON scan, decide, decisions)."));
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
    if (rest[0] === "agents") {
      const doc = agentUsageText();
      if (doc === null) {
        fail("agent usage doc not found (skill/agent-usage.md missing).");
        return 1;
      }
      console.log(doc.trimEnd());
      return 0;
    }
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
    if (cmd === "decide") return await cmdDecide(rest);
    if (cmd === "decisions") return await cmdDecisions(rest);
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
