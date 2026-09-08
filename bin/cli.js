#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { DOCTOR_FILE_RE } from "./contract.js";
import { cohortFileCount, renderReport, renderVerifyResult, unsafeSkipLine } from "./report.js";
import { copyToClipboard } from "./clipboard.js";
import { runDashboard } from "./dashboard.js";
import { brokenDoctors, discoverDoctors, globalDoctorsDir, unsafeSlugs, scopeLabel } from "./discover.js";
import { causeSummaryLine, describeRunnerError, isRunnerError, runDoctor, runDoctorCohort, verifyDoctor } from "./runner.js";
import { scanDoctorFile, capabilitySummary } from "./capabilities.js";
import { selectDoctor } from "./select.js";
import { pickItemsOn } from "./picker.js";
import { canRunTui, processTtyEnv } from "./tty.js";
import { BOLD, CYAN, DIM, GREEN, RED, RESET, YELLOW } from "./palette.js";
function fail(msg) {
    console.error(RED + msg + RESET);
}
function ok(msg) {
    console.log(GREEN + msg + RESET);
}
function warn(msg) {
    console.log(YELLOW + msg + RESET);
}
function dim(msg) {
    return DIM + msg + RESET;
}
function skillText() {
    const p = fileURLToPath(new URL("../skill/any-doctor.skill.md", import.meta.url));
    try {
        return fs.readFileSync(p, "utf8");
    }
    catch {
        return null;
    }
}
function useColor() {
    return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}
// Commands compute exit codes; process.exit happens exactly once, in the
// direct-invocation guard at the bottom of this file. An ExitCode thrown
// mid-command aborts it with a code — main flattens it into its return
// value, so callers and tests always get a number, never a rejection.
class ExitCode extends Error {
    constructor(code) {
        super("exit " + code);
        this.code = code;
    }
}
// The one place the command layer crosses the Runner seam: a failure here is
// a failure of the whole command, so it renders and aborts. Exit policy
// lives in this layer, never in the Runner.
async function runOrReport(work) {
    try {
        return await work;
    }
    catch (e) {
        fail(isRunnerError(e) ? describeRunnerError(e) : String(e));
        throw new ExitCode(1);
    }
}
function warnBrokenDoctors(skipped) {
    for (const b of skipped) {
        console.log(YELLOW + "\u26a0 skipping broken doctor " + b.slug + RESET + dim(" — " + causeSummaryLine(b.cause)));
    }
}
function selectionOutcome(sel) {
    switch (sel.kind) {
        case "doctor":
            warnBrokenDoctors(sel.skipped);
            if (sel.unsafe.length > 0)
                warn("\u26a0 " + unsafeSkipLine(sel.unsafe));
            return { doctorPath: sel.doctorPath };
        case "not-found":
            fail(`no doctor program found for "${sel.arg}"`);
            fail(`searched ./doctors (walking up from ${process.cwd()}) and ~/.any-doctor/doctors`);
            return { exit: 1 };
        case "none-discovered":
            fail(`no doctors discovered in ${process.cwd()}/doctors or ~/.any-doctor/doctors`);
            fail('create one with: any-doctor generate "<intent>"');
            if (sel.unsafe.length > 0)
                warn("\u26a0 " + unsafeSkipLine(sel.unsafe));
            for (const b of sel.broken)
                fail("broken: " + b.slug + " — " + causeSummaryLine(b.cause));
            return { exit: 1 };
        case "non-interactive":
            warnBrokenDoctors(sel.skipped);
            if (sel.unsafe.length > 0)
                warn("\u26a0 " + unsafeSkipLine(sel.unsafe));
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
function parseArgs(args) {
    const out = { targetDir: path.resolve("."), all: false, global: false, includeTests: false };
    let targetDirSet = false;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--all")
            out.all = true;
        else if (a === "--global")
            out.global = true;
        else if (a === "--include-tests")
            out.includeTests = true;
        else if (out.doctorPath === undefined && DOCTOR_FILE_RE.test(a))
            out.doctorPath = a;
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
async function gatherDoctors() {
    const all = await discoverDoctors(process.cwd());
    return {
        valid: all.filter(d => d.meta !== null),
        skippedUnsafe: unsafeSlugs(all),
        broken: brokenDoctors(all),
    };
}
async function scanOnce(options) {
    const result = await runOrReport(runDoctor(options));
    return {
        group: { programName: path.basename(options.programPath), meta: result.meta, findings: result.findings },
        fileCount: result.fileCount,
    };
}
// The batch commands' empty-cohort policy: no doctors at all is a setup
// error; only-skipped doctors are named and fail quietly. True means the
// caller returns 1.
function cohortUnusable(cohort) {
    if (cohort.valid.length > 0)
        return false;
    if (cohort.skippedUnsafe.length === 0) {
        fail("no doctors discovered — run from a directory with doctors/, or specify a doctor path");
    }
    else {
        warn("\u26a0 " + unsafeSkipLine(cohort.skippedUnsafe));
    }
    return true;
}
async function cmdRun(args) {
    var _a, _b;
    const parsed = parseArgs(args);
    if (parsed.global) {
        fail("--global is a generate-only flag");
        return 1;
    }
    // One RunOutcome for both modes — a doctor path targets one doctor;
    // --all and the no-argument default run every discovered doctor (a crash
    // is data — named, and it fails the command).
    let outcome;
    if (parsed.doctorPath) {
        const sel = await selectDoctor(parsed.doctorPath, {
            cwd: process.cwd(),
            useColor: useColor(),
            env: processTtyEnv(),
        });
        const selection = selectionOutcome(sel);
        if ("exit" in selection)
            return selection.exit;
        const runStarted = Date.now();
        const scan = await scanOnce({ programPath: selection.doctorPath, targetDir: parsed.targetDir, includeTests: parsed.includeTests });
        outcome = {
            groups: [scan.group],
            crashed: [],
            skippedUnsafe: [],
            doctorPaths: new Map([[scan.group.meta.id, selection.doctorPath]]),
            fileCount: scan.fileCount,
            durationMs: Date.now() - runStarted,
            targetDir: parsed.targetDir,
        };
    }
    else {
        const cohort = await gatherDoctors();
        warnBrokenDoctors(cohort.broken);
        if (cohortUnusable(cohort))
            return 1;
        let doctors = cohort.valid;
        const skippedUnsafe = cohort.skippedUnsafe;
        // The cold start is opt-in: the selector opens with nothing
        // pre-selected, space selects, a selects every filtered row, and
        // Enter runs the selection — narrowing to one doctor is one space,
        // not nine deselects (D15 amendment 2026-09-08 — the pack outgrew
        // the no-picker flow).
        // --all, headless, and non-TTY never see a prompt.
        const selEnv = processTtyEnv();
        const selCols = (_a = process.stdout.columns) !== null && _a !== void 0 ? _a : 0;
        if (!parsed.all && canRunTui(selEnv) && !process.env.ANY_DOCTOR_HEADLESS && (selCols === 0 || selCols >= 60)) {
            const chosen = await pickItemsOn(selEnv, doctors.map(d => ({
                id: d.meta.id,
                label: d.meta.id,
                sub: [scopeLabel(d.scope), d.meta.description].filter(Boolean).join(" · "),
            })), useColor());
            if (chosen === null)
                return 0; // esc — nothing ran, nothing to report
            const keep = new Set(chosen.map(it => it.id));
            doctors = doctors.filter(d => keep.has(d.meta.id));
        }
        const runStarted = Date.now();
        const groups = [];
        const crashed = [];
        const doctorPaths = new Map();
        // The cohort runs through the runner's bounded pool (see
        // runDoctorCohort) — order preserved, a crash stays data, and the
        // per-crash line is the same one a single-doctor run prints.
        const runs = await runDoctorCohort(doctors.map(d => ({
            programPath: d.path,
            targetDir: parsed.targetDir,
            includeTests: parsed.includeTests,
        })));
        const fileCounts = [];
        for (const [i, run] of runs.entries()) {
            const id = doctors[i].meta.id;
            const programPath = doctors[i].path;
            if (!run.ok) {
                crashed.push(id);
                fail(describeRunnerError(run.cause));
                continue;
            }
            fileCounts.push(run.result.fileCount);
            doctorPaths.set(id, programPath);
            groups.push({ programName: path.basename(programPath), meta: run.result.meta, findings: run.result.findings });
        }
        outcome = {
            groups,
            crashed,
            skippedUnsafe,
            doctorPaths,
            fileCount: cohortFileCount(fileCounts),
            durationMs: Date.now() - runStarted,
            targetDir: parsed.targetDir,
        };
    }
    const env = processTtyEnv();
    const ttyCols = (_b = process.stdout.columns) !== null && _b !== void 0 ? _b : 0;
    // Report-vs-dashboard policy: --all is the batch/report mode; otherwise
    // a real terminal with room and no headless override gets the tree.
    const interactive = !parsed.all
        && canRunTui(env) && !process.env.ANY_DOCTOR_HEADLESS && (ttyCols === 0 || ttyCols >= 60);
    if (!interactive) {
        console.log(renderReport(outcome, useColor()));
        if (outcome.crashed.length > 0) {
            for (const id of outcome.crashed)
                fail("doctor crashed (results above are partial): " + id);
            return 1;
        }
        return outcome.skippedUnsafe.length > 0 ? 1 : 0;
    }
    const invoker = process.argv[1] ? `node "${fs.realpathSync(process.argv[1])}"` : "any-doctor";
    // Interactive runs always show what did run: skips and crashes cost the
    // exit code, never the results. Crashes are named before the dashboard
    // paints — the dashboard itself renders findings and skips, not crashes.
    for (const id of outcome.crashed)
        fail("doctor crashed (results above are partial): " + id);
    await runDashboard({ outcome, invoker, useColor: useColor() });
    return outcome.crashed.length > 0 || outcome.skippedUnsafe.length > 0 ? 1 : 0;
}
async function cmdVerify(args) {
    const parsed = parseArgs(args);
    if (parsed.global) {
        fail("--global is a generate-only flag");
        return 1;
    }
    if (parsed.includeTests) {
        warn("--include-tests applies to run only — verify always scans everything its fixtures seed");
    }
    if (parsed.all) {
        const cohort = await gatherDoctors();
        warnBrokenDoctors(cohort.broken);
        if (cohort.skippedUnsafe.length > 0)
            warn("\u26a0 " + unsafeSkipLine(cohort.skippedUnsafe));
        if (cohortUnusable(cohort))
            return 1;
        const discovered = cohort.valid;
        const skippedUnsafe = cohort.skippedUnsafe;
        let totalFailures = 0;
        const crashed = [];
        for (const d of discovered) {
            console.log(BOLD + d.meta.id + RESET);
            console.log(DIM + "  capabilities: " + capabilitySummary(scanDoctorFile(d.path)) + RESET);
            try {
                const r = await runOrReport(verifyDoctor({ programPath: d.path }));
                console.log(renderVerifyResult(r, useColor()));
                totalFailures += r.results.filter(x => !x.ok).length;
            }
            catch (e) {
                if (!(e instanceof ExitCode))
                    throw e;
                console.log(RED + "  crashed — skipped" + RESET);
                crashed.push(d.meta.id);
            }
            console.log("");
        }
        if (totalFailures > 0 || crashed.length > 0 || skippedUnsafe.length > 0) {
            const parts = [];
            if (totalFailures > 0)
                parts.push(totalFailures + " fixture(s) failed");
            if (crashed.length > 0)
                parts.push(crashed.length + " doctor(s) crashed: " + crashed.join(", "));
            if (skippedUnsafe.length > 0)
                parts.push(unsafeSkipLine(skippedUnsafe));
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
    if ("exit" in outcome)
        return outcome.exit;
    console.log(DIM + "capabilities: " + capabilitySummary(scanDoctorFile(outcome.doctorPath)) + RESET);
    const result = await runOrReport(verifyDoctor({ programPath: outcome.doctorPath }));
    console.log(renderVerifyResult(result, useColor()));
    const failures = result.results.filter(x => !x.ok).length;
    console.log("");
    console.log(dim(`${result.results.length - failures}/${result.results.length} fixtures passed for ${result.meta.id}`));
    return failures > 0 ? 1 : 0;
}
// The planted copy of the skill once went three decisions stale
// (doctors/AGENTS.md still taught "builtins allowed" after Confinement
// refused every import), so planting refreshes: a copy any-doctor planted
// carries the provenance marker and is overwritten on generate; a copy
// without it is the user's and is never touched.
const PLANT_MARKER = "<!-- any-doctor skill plant -->\n";
export function plantSkill(scopeDir, skill) {
    const agentsPath = path.join(scopeDir, "AGENTS.md");
    const existing = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf8") : null;
    if (existing === null || existing.startsWith(PLANT_MARKER)) {
        fs.writeFileSync(agentsPath, PLANT_MARKER + skill);
        return existing === null ? "planted" : "refreshed";
    }
    return "left-user-copy";
}
async function cmdGenerate(args) {
    let intent;
    let global = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--global")
            global = true;
        else if (intent === undefined)
            intent = args[i];
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
    }
    else {
        console.log(prompt);
        warn("clipboard unavailable — copy the prompt above");
    }
    console.log("");
    console.log(dim("once your agent has written both files, gate it:"));
    console.log(dim('  node "' + cliJs + '" verify "' + doctorAbs + '"'));
    return 0;
}
const STOP_WORDS = new Set(["a", "an", "the", "find", "flag", "all", "that", "which", "is", "are", "in", "on", "of", "to", "and", "or", "not"]);
function slugify(intent) {
    const words = intent.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim().split(/\s+/);
    const kept = words.filter(w => w && !STOP_WORDS.has(w)).slice(0, 5);
    return (kept.length ? kept : ["custom-doctor"]).join("-").slice(0, 60);
}
function usage() {
    console.log(BOLD + "any-doctor" + RESET + dim(" — your agent writes the analyzer, fixtures prove it, CI reruns it forever"));
    console.log("");
    console.log('  generate "<intent>" [--global]      print the exact prompt for your agent to build a doctor');
    console.log("  run [--all] [--include-tests] [doctor.(m)js] [dir]   scan; no argument = every doctor in one review tree");
    console.log("  verify [--all] [doctor.(m)js]     fixture gate (no doctor: fuzzy picker; --all: every doctor)");
    console.log("");
    console.log(dim("doctors live in ./doctors/ (repo), ~/.any-doctor/doctors/ (global), and the bundled pack (lowest priority)."));
    console.log(dim("generation delegates to your installed agent — run and verify never touch a model."));
}
export async function main(argv = process.argv.slice(2)) {
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
    if (!cmd)
        return await cmdRun(rest);
    try {
        if (cmd === "generate")
            return await cmdGenerate(rest);
        if (cmd === "run")
            return await cmdRun(rest);
        if (cmd === "verify")
            return await cmdVerify(rest);
    }
    catch (e) {
        if (e instanceof ExitCode)
            return e.code;
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
    }
    catch {
        return false;
    }
})();
if (invokedDirectly) {
    main().then((code) => process.exit(code), (e) => {
        console.error(RED + (e && e.stack ? e.stack : String(e)) + RESET);
        process.exit(1);
    });
}
