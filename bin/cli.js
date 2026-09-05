#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { DOCTOR_FILE_RE } from "./contract.js";
import { renderReport, renderVerifyResult } from "./report.js";
import { copyToClipboard } from "./clipboard.js";
import { runDashboard } from "./dashboard.js";
import { discoverDoctors, globalDoctorsDir } from "./discover.js";
import { describeRunnerError, isRunnerError, runDoctor, verifyDoctor } from "./runner.js";
import { selectDoctor } from "./select.js";
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
// mid-command aborts it with a code, which main flattens.
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
        console.log(YELLOW + "⚠ skipping broken doctor " + b.slug + RESET + dim(" — " + (b.error || "invalid meta")));
    }
}
function selectionOutcome(sel) {
    switch (sel.kind) {
        case "doctor":
            warnBrokenDoctors(sel.skipped);
            return { doctorPath: sel.doctorPath };
        case "not-found":
            fail(`no doctor program found for "${sel.arg}"`);
            fail(`searched ./doctors (walking up from ${process.cwd()}) and ~/.any-doctor/doctors`);
            return 1;
        case "none-discovered":
            fail(`no doctors discovered in ${process.cwd()}/doctors or ~/.any-doctor/doctors`);
            fail('create one with: any-doctor generate "<intent>"');
            for (const b of sel.broken)
                fail("broken: " + b.slug + " — " + (b.error || "invalid meta"));
            return 1;
        case "non-interactive":
            warnBrokenDoctors(sel.skipped);
            console.log("available doctors:");
            for (const row of sel.rows) {
                const suffix = row.count === undefined
                    ? ""
                    : row.count.status === "failed"
                        ? RED + " count failed" + RESET
                        : dim(" " + row.count.count + " issue" + (row.count.count === 1 ? "" : "s"));
                console.log("  " + row.scope.padEnd(7) + row.slug.padEnd(32) + dim(row.description) + suffix);
            }
            fail("non-interactive session — specify a doctor path");
            return 1;
        case "cancelled":
            return 0;
    }
}
function parseArgs(args) {
    const out = { targetDir: path.resolve("."), all: false, global: false };
    let targetDirSet = false;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--all")
            out.all = true;
        else if (a === "--global")
            out.global = true;
        else if (out.doctorPath === undefined && DOCTOR_FILE_RE.test(a))
            out.doctorPath = a;
        else if (!targetDirSet) {
            out.targetDir = path.resolve(a);
            targetDirSet = true;
        }
    }
    return out;
}
async function scanOnce(doctorAbs, targetDir) {
    const result = await runOrReport(runDoctor({ programPath: doctorAbs, targetDir }));
    return {
        result,
        groups: [{ programName: path.basename(doctorAbs), meta: result.meta, findings: result.findings }],
        findings: result.findings,
        fileCount: result.fileCount,
        durationMs: result.durationMs,
    };
}
async function cmdRun(args) {
    var _a;
    const parsed = parseArgs(args);
    if (parsed.global) {
        fail("--global is a generate-only flag");
        return 1;
    }
    const started = Date.now();
    // One aggregation for both batch modes: a doctor path targets one
    // doctor; --all and the no-argument default run every discovered doctor
    // (a crash is data — named, and it fails the command).
    const groups = [];
    const crashed = [];
    const doctorPaths = new Map();
    let fileCount = 0;
    let durationMs = Date.now() - started;
    let doctorFile = null;
    if (parsed.doctorPath) {
        const sel = await selectDoctor(parsed.doctorPath, {
            cwd: process.cwd(),
            targetDir: parsed.targetDir,
            useColor: useColor(),
            env: processTtyEnv(),
        });
        const outcome = selectionOutcome(sel);
        if (typeof outcome === "number")
            return outcome;
        const scan = await scanOnce(outcome.doctorPath, parsed.targetDir);
        doctorFile = outcome.doctorPath;
        doctorPaths.set(scan.groups[0].meta.id, outcome.doctorPath);
        groups.push(...scan.groups);
        fileCount = scan.fileCount;
        durationMs = scan.durationMs;
    }
    else {
        const discovered = (await discoverDoctors(process.cwd())).filter(d => d.meta !== null);
        if (discovered.length === 0) {
            fail("no doctors discovered — run from a directory with doctors/, or specify a doctor path");
            return 1;
        }
        for (const d of discovered) {
            try {
                const scan = await scanOnce(d.path, parsed.targetDir);
                fileCount = Math.max(fileCount, scan.fileCount);
                doctorPaths.set(d.meta.id, d.path);
                groups.push(...scan.groups);
            }
            catch (e) {
                if (!(e instanceof ExitCode))
                    throw e;
                crashed.push(d.meta.id);
            }
        }
        durationMs = Date.now() - started;
    }
    const env = processTtyEnv();
    const ttyCols = (_a = process.stdout.columns) !== null && _a !== void 0 ? _a : 0;
    // Report-vs-dashboard policy: --all is the batch/report mode; otherwise
    // a real terminal with room and no headless override gets the tree.
    const interactive = !parsed.all
        && canRunTui(env) && !process.env.ANY_DOCTOR_HEADLESS && (ttyCols === 0 || ttyCols >= 60);
    if (!interactive) {
        console.log(renderReport({ fileCount, durationMs, groups }, useColor()));
        if (crashed.length > 0) {
            for (const id of crashed)
                fail("doctor crashed (results above are partial): " + id);
            return 1;
        }
        return 0;
    }
    const invoker = process.argv[1] ? `node "${fs.realpathSync(process.argv[1])}"` : "any-doctor";
    await runDashboard({
        root: parsed.targetDir,
        groups,
        doctorFile: doctorFile !== null && doctorFile !== void 0 ? doctorFile : "",
        doctorFileFor: doctorPaths.size > 0 ? (id) => { var _a, _b; return (_b = (_a = doctorPaths.get(id)) !== null && _a !== void 0 ? _a : doctorFile) !== null && _b !== void 0 ? _b : ""; } : undefined,
        invoker,
        fileCount,
        durationMs,
        useColor: useColor(),
    });
    return 0;
}
async function cmdVerify(args) {
    const parsed = parseArgs(args);
    if (parsed.global) {
        fail("--global is a generate-only flag");
        return 1;
    }
    if (parsed.all) {
        const discovered = (await discoverDoctors(process.cwd())).filter(d => d.meta !== null);
        if (discovered.length === 0) {
            fail("no doctors discovered");
            return 1;
        }
        let totalFailures = 0;
        const crashed = [];
        for (const d of discovered) {
            console.log(BOLD + d.meta.id + RESET);
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
        if (totalFailures > 0 || crashed.length > 0) {
            const parts = [];
            if (totalFailures > 0)
                parts.push(totalFailures + " fixture(s) failed");
            if (crashed.length > 0)
                parts.push(crashed.length + " doctor(s) crashed: " + crashed.join(", "));
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
    if (typeof outcome === "number")
        return outcome;
    const result = await runOrReport(verifyDoctor({ programPath: outcome.doctorPath }));
    console.log(renderVerifyResult(result, useColor()));
    const failures = result.results.filter(x => !x.ok).length;
    console.log("");
    console.log(dim(`${result.results.length - failures}/${result.results.length} fixtures passed for ${result.meta.id}`));
    return failures > 0 ? 1 : 0;
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
    console.log("  run [--all] [doctor.(m)js] [dir]   scan; no argument = every doctor in one review tree");
    console.log("  verify [--all] [doctor.(m)js]     fixture gate (no doctor: fuzzy picker; --all: every doctor)");
    console.log("");
    console.log(dim("doctors live in ./doctors/ (repo) and ~/.any-doctor/doctors/ (global)."));
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
    if (!cmd || cmd === "help" || cmd === "--help") {
        usage();
        return 0;
    }
    if (cmd === "generate")
        return cmdGenerate(rest);
    if (cmd === "run")
        return cmdRun(rest);
    if (cmd === "verify")
        return cmdVerify(rest);
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
        if (e instanceof ExitCode)
            process.exit(e.code);
        console.error(RED + (e && e.stack ? e.stack : String(e)) + RESET);
        process.exit(1);
    });
}
