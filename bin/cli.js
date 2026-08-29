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
const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";
function fail(msg) {
    console.error(RED + msg + RESET);
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
function usage() {
    console.log(BOLD + "any-doctor" + RESET + dim(" — your agent writes the analyzer, fixtures prove it, CI reruns it forever"));
    console.log("");
    console.log("  run <doctor.(m)js> [dir]     execute a doctor program and render the report");
    console.log("  verify <doctor.(m)js>        run the doctor against its fixtures (exact-set diff)");
    console.log("");
    console.log(dim("doctors live next to their fixtures: <name>.mjs + <name>.fixtures.mjs"));
    console.log(dim("enforcement never touches a model — safe for CI."));
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
    fail("unknown command: " + cmd);
    usage();
    process.exit(1);
}
main();
