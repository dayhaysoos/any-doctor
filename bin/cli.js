#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const contract_1 = require("./contract");
const report_1 = require("./report");
const browse_1 = require("./browse");
const discover_1 = require("./discover");
const picker_1 = require("./picker");
const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";
function fail(msg) {
    console.error(RED + msg + RESET);
}
function ok(msg) {
    console.log(GREEN + msg + RESET);
}
function dim(msg) {
    return DIM + msg + RESET;
}
function sh(cmd, args, opts = {}) {
    var _a;
    const r = (0, child_process_1.spawnSync)(cmd, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: (_a = opts.timeoutMs) !== null && _a !== void 0 ? _a : 5 * 60 * 1000,
        cwd: opts.cwd,
    });
    return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}
function skillText() {
    const p = path.join(__dirname, "..", "skill", "any-doctor.skill.md");
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
function parseResult(stdout) {
    const lines = stdout.split("\n");
    const idx = lines.findLastIndex(l => l.startsWith(contract_1.RESULT_SENTINEL));
    if (idx === -1) {
        fail("doctor produced no framed result — stdout was:\n" + stdout.slice(0, 500));
        process.exit(1);
    }
    return JSON.parse(lines[idx].slice(contract_1.RESULT_SENTINEL.length));
}
function executeLoader(programPath, mode, arg, targetDir) {
    const abs = path.resolve(programPath);
    if (!fs.existsSync(abs)) {
        fail("no such doctor program: " + abs);
        process.exit(1);
    }
    const loader = path.join(__dirname, "doctor-loader.mjs");
    const argv = mode && arg !== null ? [loader, abs, mode, arg] : [loader, abs, targetDir !== null && targetDir !== void 0 ? targetDir : "."];
    const r = sh(process.execPath, argv);
    if (r.status !== 0) {
        fail("doctor crashed:\n" + (r.stderr || "exit " + r.status));
        process.exit(1);
    }
    return parseResult(r.stdout);
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
        else if (a === "--agent")
            out.agent = args[++i];
        else if (out.doctorPath === undefined && /\.(m|c)?js$/.test(a))
            out.doctorPath = a;
        else if (!targetDirSet) {
            out.targetDir = path.resolve(a);
            targetDirSet = true;
        }
    }
    return out;
}
async function pickDoctor(cwd, action) {
    const discovered = (0, discover_1.discoverDoctors)(cwd);
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
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.log("available doctors:");
        for (const d of valid) {
            console.log("  " + d.scope.padEnd(7) + d.slug.padEnd(32) + dim(d.meta.description));
        }
        fail("non-interactive session — specify a doctor path");
        process.exit(1);
    }
    const chosen = await (0, picker_1.pickItem)(valid.map(d => ({
        id: d.slug,
        label: d.meta.description,
        sub: d.scope + "/" + d.slug + ".mjs",
        severity: d.meta.severity,
    })), useColor());
    if (chosen === null)
        process.exit(0);
    const match = valid.find(v => v.slug === chosen.id);
    void action;
    return match;
}
async function cmdRun(args) {
    const parsed = parseArgs(args);
    const started = Date.now();
    const groups = [];
    let fileCount = 0;
    if (parsed.all) {
        const discovered = (0, discover_1.discoverDoctors)(process.cwd()).filter(d => d.meta !== null);
        if (discovered.length === 0) {
            fail("no doctors discovered — run from a directory with doctors/, or specify a doctor path");
            process.exit(1);
        }
        for (const d of discovered) {
            const r = executeLoader(d.path, null, null, parsed.targetDir);
            fileCount = Math.max(fileCount, r.fileCount);
            groups.push({ programName: path.basename(d.path), meta: r.meta, findings: r.findings });
        }
    }
    else {
        let doctorPath = parsed.doctorPath;
        if (!doctorPath) {
            const chosen = await pickDoctor(process.cwd(), "run");
            doctorPath = chosen.path;
        }
        const r = executeLoader(doctorPath, null, null, parsed.targetDir);
        fileCount = r.fileCount;
        groups.push({ programName: path.basename(doctorPath), meta: r.meta, findings: r.findings });
        const text = (0, report_1.renderReport)({ fileCount, durationMs: Date.now() - started, groups }, useColor());
        console.log(text);
        if (r.findings.length > 0 && process.stdin.isTTY && process.stdout.isTTY && !process.env.ANY_DOCTOR_HEADLESS) {
            console.log("");
            await (0, browse_1.browseFindings)({
                root: parsed.targetDir,
                description: r.meta.description,
                severity: r.meta.severity,
                findings: r.findings,
            }, useColor());
        }
        return;
    }
    const text = (0, report_1.renderReport)({ fileCount, durationMs: Date.now() - started, groups }, useColor());
    console.log(text);
}
function printVerifyResult(result) {
    const color = useColor();
    const g = (s) => (color ? GREEN + s + RESET : s);
    const r = (s) => (color ? RED + s + RESET : s);
    let failures = 0;
    for (const c of result.results) {
        if (c.ok) {
            console.log(g("  ✔ " + c.name));
        }
        else {
            failures++;
            console.log(r("  ✖ " + c.name));
            for (const m of c.missing)
                console.log("    " + r("missing expected finding") + " " + m.file + ":" + m.line);
            for (const u of c.unexpected)
                console.log("    " + r("unexpected finding") + " " + u.file + ":" + u.line);
            if (c.error)
                console.log("    " + r("crashed: ") + c.error);
        }
    }
    return failures;
}
function fixturesPathFor(doctorPath) {
    return doctorPath.replace(/\.(m|c)?js$/, "") + ".fixtures.mjs";
}
async function cmdVerify(args) {
    const parsed = parseArgs(args);
    if (parsed.all) {
        const discovered = (0, discover_1.discoverDoctors)(process.cwd()).filter(d => d.meta !== null);
        if (discovered.length === 0) {
            fail("no doctors discovered");
            process.exit(1);
        }
        let totalFailures = 0;
        for (const d of discovered) {
            console.log(BOLD + d.meta.id + RESET);
            const r = executeLoader(d.path, "--verify", path.resolve(fixturesPathFor(d.path)));
            const f = printVerifyResult(r);
            totalFailures += f;
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
        const chosen = await pickDoctor(process.cwd(), "verify");
        doctorPath = chosen.path;
    }
    const fixturesPath = fixturesPathFor(doctorPath);
    if (!fs.existsSync(path.resolve(fixturesPath))) {
        fail("no fixtures found for this doctor — expected " + fixturesPath);
        process.exit(1);
    }
    const result = executeLoader(doctorPath, "--verify", path.resolve(fixturesPath));
    const failures = printVerifyResult(result);
    console.log("");
    console.log(dim(`${result.results.length - failures}/${result.results.length} fixtures passed for ${result.meta.id}`));
    if (failures > 0)
        process.exit(1);
}
function registerDoctor(scopeDir, slug, intent) {
    const idxPath = path.join(scopeDir, "index.json");
    let idx = {};
    if (fs.existsSync(idxPath)) {
        try {
            idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
        }
        catch {
            idx = {};
        }
    }
    idx.version = 1;
    idx.doctors = (idx.doctors || []).filter(d => d.slug !== slug);
    idx.doctors.push({ slug, intent, createdAt: new Date().toISOString(), protocolVersion: 1 });
    fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2));
}
async function cmdGenerate(args) {
    let intent;
    let explicitAgent;
    let global = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--agent")
            explicitAgent = args[++i];
        else if (args[i] === "--global")
            global = true;
        else if (intent === undefined)
            intent = args[i];
    }
    if (!intent) {
        fail('usage: any-doctor generate "<one-line intent>" [--agent <cmd>] [--global]');
        process.exit(1);
    }
    const skill = skillText();
    if (skill === null) {
        fail("generation skill not found (skill/any-doctor.skill.md missing).");
        process.exit(1);
    }
    const agent = resolveAgent(explicitAgent);
    if (agent === null) {
        fail("No coding agent found. Any Doctor does not bundle an LLM — it delegates");
        fail("to the agent you already have. Install one of: claude, codex, opencode,");
        fail("or set ANY_DOCTOR_AGENT / --agent to a command taking the prompt as its last arg.");
        process.exit(1);
    }
    const slug = slugify(intent);
    const scopeDir = global
        ? (fs.mkdirSync((0, discover_1.globalDoctorsDir)(), { recursive: true }), (0, discover_1.globalDoctorsDir)())
        : path.resolve("doctors");
    fs.mkdirSync(scopeDir, { recursive: true });
    const agentsPath = path.join(scopeDir, "AGENTS.md");
    if (!fs.existsSync(agentsPath)) {
        fs.writeFileSync(agentsPath, skill);
    }
    const cliJs = path.join(__dirname, "cli.js");
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
        '  node "' + cliJs + '" verify "' + path.join(scopeDir, slug + ".mjs") + '"',
        "Then stop and report.",
    ].join("\n");
    console.log(BOLD + "generating doctor " + CYAN + slug + RESET + dim(" via " + agent.raw) + dim(global ? " (global scope)" : ""));
    const r = sh(agent.bin, agentArgs(agent, prompt), { timeoutMs: 12 * 60 * 1000, cwd: scopeDir });
    if (r.status !== 0) {
        fail("generation agent exited non-zero (" + r.status + ")");
        process.exit(r.status || 1);
    }
    console.log("");
    console.log(BOLD + "verifying (deterministic — no model in this part):" + RESET);
    const doctorAbs = path.join(scopeDir, slug + ".mjs");
    const fixturesAbs = path.join(scopeDir, slug + ".fixtures.mjs");
    if (!fs.existsSync(doctorAbs) || !fs.existsSync(fixturesAbs)) {
        fail("agent did not create " + slug + ".mjs / " + slug + ".fixtures.mjs in " + scopeDir);
        process.exit(1);
    }
    const result = executeLoader(doctorAbs, "--verify", fixturesAbs);
    const failures = printVerifyResult(result);
    if (failures > 0) {
        fail(failures + " fixture(s) failed — the agent's doctor did not pass the gate. Fix or delete " + doctorAbs);
        process.exit(1);
    }
    registerDoctor(scopeDir, slug, intent);
    ok(slug + " generated, fixture-green, registered in " + (global ? "~/.any-doctor" : "repo-local") + " scope");
}
function resolveAgent(explicit) {
    const candidates = [];
    if (explicit)
        candidates.push(explicit);
    if (process.env.ANY_DOCTOR_AGENT)
        candidates.push(process.env.ANY_DOCTOR_AGENT);
    candidates.push("claude", "codex", "opencode");
    for (const cand of candidates) {
        if (!cand)
            continue;
        const bin = cand.split(/\s+/)[0];
        const r = (0, child_process_1.spawnSync)("sh", ["-c", "command -v " + bin], { encoding: "utf8" });
        if (r.status === 0 && r.stdout.trim()) {
            return { raw: cand, bin, path: r.stdout.trim() };
        }
    }
    return null;
}
function agentArgs(agent, prompt) {
    if (agent.bin === "claude") {
        return ["-p", prompt, "--allowedTools", "Read,Edit,Write,Bash", "--permission-mode", "acceptEdits"];
    }
    if (agent.bin === "codex") {
        return ["exec", "--full-auto", prompt];
    }
    if (agent.bin === "opencode") {
        return ["run", "--auto", prompt];
    }
    if (agent.raw.includes("{prompt}")) {
        return agent.raw.split(/\s+/).slice(1).map(a => a.replace("{prompt}", prompt));
    }
    return agent.raw.split(/\s+/).slice(1).concat([prompt]);
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
    console.log('  generate "<intent>" [--global] [--agent <cmd>]  your agent writes a doctor + fixtures, verify gates it');
    console.log("  run [--all] [doctor.(m)js] [dir]  scan + report (no doctor: fuzzy picker; --all: every doctor)");
    console.log("  verify [--all] [doctor.(m)js]     fixture gate (no doctor: fuzzy picker; --all: every doctor)");
    console.log("");
    console.log(dim("doctors live in ./doctors/ (repo) and ~/.any-doctor/doctors/ (global)."));
    console.log(dim("generation delegates to your installed agent — run and verify never touch a model."));
}
async function main() {
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 18) {
        fail("any-doctor requires Node >= 18 — you are running " + process.versions.node);
        process.exit(1);
    }
    const argv = process.argv.slice(2);
    const cmd = argv[0];
    const rest = argv.slice(1);
    if (!cmd || cmd === "help" || cmd === "--help")
        return usage();
    if (cmd === "generate")
        return cmdGenerate(rest);
    if (cmd === "run")
        return cmdRun(rest);
    if (cmd === "verify")
        return cmdVerify(rest);
    fail("unknown command: " + cmd);
    usage();
    process.exit(1);
}
main().catch(e => {
    console.error(RED + (e && e.stack ? e.stack : String(e)) + RESET);
    process.exit(1);
});
