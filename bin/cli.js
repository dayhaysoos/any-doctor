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
const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";
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
function sh(cmd, args, timeoutMs = 5 * 60 * 1000) {
    const r = (0, child_process_1.spawnSync)(cmd, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: timeoutMs,
    });
    return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
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
function useColor() {
    return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}
async function cmdRun(args) {
    const programPath = args[0];
    const targetDir = path.resolve(args[1] || ".");
    if (!programPath) {
        fail("usage: any-doctor run <doctor-program.(m)js> [targetDir]");
        process.exit(1);
    }
    const result = executeLoader(programPath, null, null, targetDir);
    const text = (0, report_1.renderReport)({
        programName: path.basename(programPath),
        description: result.meta.description,
        severity: result.meta.severity,
        blindSpots: result.meta.blindSpots,
        fileCount: result.fileCount,
        durationMs: result.durationMs,
        findings: result.findings,
    }, useColor());
    console.log(text);
    if (result.findings.length > 0 && process.stdin.isTTY && process.stdout.isTTY && !process.env.ANY_DOCTOR_HEADLESS) {
        console.log("");
        await (0, browse_1.browseFindings)({
            root: targetDir,
            description: result.meta.description,
            severity: result.meta.severity,
            findings: result.findings,
        }, useColor());
    }
}
function cmdVerify(args) {
    const programPath = args[0];
    const fixturesPath = programPath.replace(/\.(m|c)?js$/, "") + ".fixtures.mjs";
    if (!programPath || !fs.existsSync(path.resolve(fixturesPath))) {
        fail("usage: any-doctor verify <doctor-program.(m)js>  (expects " + fixturesPath + ")");
        process.exit(1);
    }
    const result = executeLoader(programPath, "--verify", path.resolve(fixturesPath));
    const color = useColor();
    const g = (s) => (color ? GREEN + s + RESET : s);
    const r = (s) => (color ? RED + s + RESET : s);
    let failures = 0;
    for (const c of result.results) {
        if (c.ok) {
            console.log(g("✔ " + c.name));
        }
        else if (c.error) {
            failures++;
            console.log(r("✖ " + c.name));
            console.log("  " + r("crashed: ") + c.error);
        }
        else {
            failures++;
            console.log(r("✖ " + c.name));
            for (const m of c.missing)
                console.log("  " + r("missing expected finding") + " " + m.file + ":" + m.line);
            for (const u of c.unexpected)
                console.log("  " + r("unexpected finding") + " " + u.file + ":" + u.line);
        }
    }
    const passed = result.results.length - failures;
    console.log("");
    console.log(dim(`${passed}/${result.results.length} fixtures passed for ${result.meta.id}`));
    if (failures > 0)
        process.exit(1);
}
const STOP_WORDS = new Set(["a", "an", "the", "find", "flag", "all", "that",
    "which", "is", "are", "in", "on", "of", "to", "and", "or", "not"]);
function slugify(intent) {
    const words = intent.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim().split(/\s+/);
    const kept = words.filter(w => w && !STOP_WORDS.has(w)).slice(0, 5);
    return (kept.length ? kept : ["custom-doctor"]).join("-").slice(0, 60);
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
        return ["-p", prompt, "--allowedTools", "Read,Edit,Write,Bash",
            "--permission-mode", "acceptEdits"];
    }
    if (agent.bin === "codex") {
        return ["exec", "--full-auto", prompt];
    }
    if (agent.bin === "opencode") {
        return ["run", prompt];
    }
    if (agent.raw.includes("{prompt}")) {
        return agent.raw.split(/\s+/).slice(1).map(a => a.replace("{prompt}", prompt));
    }
    return agent.raw.split(/\s+/).slice(1).concat([prompt]);
}
async function cmdGenerate(args) {
    let intent;
    let explicitAgent;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--agent")
            explicitAgent = args[++i];
        else if (intent === undefined)
            intent = args[i];
    }
    if (!intent) {
        fail('usage: any-doctor generate "<one-line intent>" [--agent <cmd>]');
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
    const prompt = [
        skill,
        "",
        "## Your task",
        "",
        "INTENT (the entire specification):",
        "  " + intent,
        "",
        "Working directory is the rule pack root. Write exactly two files:",
        "  doctors/" + slug + ".mjs",
        "  doctors/" + slug + ".fixtures.mjs",
        "Then run: any-doctor verify doctors/" + slug + ".mjs",
        "Iterate until every fixture passes. Then stop and report.",
    ].join("\n");
    console.log(BOLD + "generating doctor " + CYAN + slug + RESET + dim(" via " + agent.raw));
    const r = sh(agent.bin, agentArgs(agent, prompt), 12 * 60 * 1000);
    if (r.status !== 0) {
        fail("generation agent exited non-zero (" + r.status + ")");
        process.exit(r.status || 1);
    }
    console.log("");
    console.log(BOLD + "verifying (deterministic — no model in this part):" + RESET);
    const doctorPath = path.join("doctors", slug + ".mjs");
    if (!fs.existsSync(doctorPath)) {
        fail("agent did not create " + doctorPath);
        process.exit(1);
    }
    const result = executeLoader(doctorPath, "--verify", path.resolve(doctorPath.replace(/\.mjs$/, "") + ".fixtures.mjs"));
    let failures = 0;
    for (const c of result.results) {
        if (c.ok) {
            console.log(GREEN + "✔ " + c.name + RESET);
        }
        else {
            failures++;
            console.log(RED + "✖ " + c.name + RESET);
            for (const m of c.missing)
                console.log("  " + RED + "missing expected finding" + RESET + " " + m.file + ":" + m.line);
            for (const u of c.unexpected)
                console.log("  " + RED + "unexpected finding" + RESET + " " + u.file + ":" + u.line);
            if (c.error)
                console.log("  " + RED + "crashed: " + c.error + RESET);
        }
    }
    if (failures > 0) {
        fail(failures + " fixture(s) failed — the agent's doctor did not pass the gate. Fix or delete " + doctorPath);
        process.exit(1);
    }
    ok(slug + " generated and fixture-green. Review it, then: any-doctor run " + doctorPath + " <target>");
}
function usage() {
    console.log(BOLD + "any-doctor" + RESET + dim(" — your agent writes the analyzer, fixtures prove it, CI reruns it forever"));
    console.log("");
    console.log('  generate "<intent>" [--agent <cmd>]  have your agent write a doctor + fixtures');
    console.log("  run <doctor.(m)js> [dir]     execute a doctor program and render the report");
    console.log("  verify <doctor.(m)js>        run the doctor against its fixtures (exact-set diff)");
    console.log("");
    console.log(dim("doctors live next to their fixtures: <name>.mjs + <name>.fixtures.mjs"));
    console.log(dim("generation uses your agent (claude | codex | opencode | ANY_DOCTOR_AGENT/--agent cmd)."));
    console.log(dim("run and verify never touch a model — safe for CI."));
}
async function main() {
    const argv = process.argv.slice(2);
    const cmd = argv[0];
    const rest = argv.slice(1);
    if (!cmd || cmd === "help" || cmd === "--help")
        return usage();
    if (cmd === "run")
        return cmdRun(rest);
    if (cmd === "verify")
        return cmdVerify(rest);
    if (cmd === "generate")
        return cmdGenerate(rest);
    fail("unknown command: " + cmd);
    usage();
    process.exit(1);
}
main();
