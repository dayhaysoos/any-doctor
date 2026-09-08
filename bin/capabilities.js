import * as fs from "fs";
import { maskNonCode } from "./mask.js";
const MODULE_SPEC = /(?:\bfrom\s+|\brequire\s*\(\s*)["'](node:)?/;
const RULES = [
    // --- red: no legitimate use in a doctor ---
    { capability: "network", level: "red", on: "raw", kind: "network module import", pattern: new RegExp(MODULE_SPEC.source + String.raw `(https?|http2|net|tls|dns|dgram|undici)["']`) },
    { capability: "network", level: "red", on: "masked", kind: "fetch", pattern: /\bfetch\s*\(/ },
    { capability: "network", level: "red", on: "masked", kind: "http call", pattern: /\bhttps?\s*\.\s*(?:get|request|createServer|Agent)\s*\(/ },
    { capability: "network", level: "red", on: "masked", kind: "WebSocket/XMLHttpRequest", pattern: /\bnew\s+(?:WebSocket|XMLHttpRequest)\b/ },
    { capability: "file write", level: "red", on: "masked", kind: "fs write call", pattern: /\bfs\s*\.\s*(?:promises\s*\.\s*)?(?:writeFile|appendFile|createWriteStream|rm|unlink|rename|mkdir|rmdir|truncate|chmod|chown)\w*\s*\(|\bfs\s*\.\s*open\s*\(\s*[^,)]*,\s*["']w/ },
    { capability: "file write", level: "red", on: "masked", kind: "write call (destructured import)", pattern: /\b(?:writeFile|appendFile|createWriteStream|rmSync|unlinkSync|rm|unlink)\s*\(/ },
    { capability: "subprocess", level: "red", on: "raw", kind: "child_process import", pattern: new RegExp(MODULE_SPEC.source + String.raw `child_process["']`) },
    { capability: "subprocess", level: "red", on: "masked", kind: "process spawn call", pattern: /(?<![.\w])(?:exec|execSync|spawn|spawnSync|execFile|execFileSync|fork)\s*\(/ },
    // A doctor is a single self-contained file: no imports of any kind.
    { capability: "import", level: "red", on: "raw", kind: "import statement (doctors are single-file programs)", pattern: /(?:\bimport\b|\bexport\b)[^\n]*\bfrom\s*["'][^"']*["']/ },
    { capability: "import", level: "red", on: "raw", kind: "side-effect import (doctors are single-file programs)", pattern: /^\s*import\s*["'][^"']*["']/ },
    { capability: "import", level: "red", on: "masked", kind: "dynamic import (doctors are single-file programs)", pattern: /\bimport\s*\(/ },
    // --- yellow: legal but out-of-contract, surface it ---
    // (No "fs import" yellow rule exists: every import line is red above —
    // the single-file law — so an fs-import yellow could never fire.)
    { capability: "direct fs read", level: "yellow", on: "masked", kind: "fs read call (bypasses ctx.files)", pattern: /\bfs\s*\.\s*(?:promises\s*\.\s*)?(?:readFile|readdir|stat|existsSync|createReadStream)\w*\s*\(/ },
    { capability: "environment", level: "yellow", on: "masked", kind: "process.env", pattern: /\bprocess\s*\.\s*env\b/ },
];
// One finding per rule per line; the first matching rule wins a line so the
// report stays a signal, not a wall.
export function scanCapabilities(source) {
    const maskedLines = maskNonCode(source).split("\n");
    const rawLines = source.split("\n");
    const findings = [];
    for (let i = 0; i < rawLines.length; i++) {
        for (const rule of RULES) {
            const line = rule.on === "raw" ? rawLines[i] : maskedLines[i];
            if (line !== undefined && rule.pattern.test(line)) {
                findings.push({
                    capability: rule.capability,
                    level: rule.level,
                    line: i + 1,
                    detail: `${rule.kind} (line ${i + 1})`,
                });
                break;
            }
        }
    }
    return {
        findings,
        red: findings.filter(f => f.level === "red"),
        yellow: findings.filter(f => f.level === "yellow"),
    };
}
// One scan per file per process: the gate, verify's capability line, and
// the tests all read the same report instead of re-scanning.
const scanCache = new Map();
export function scanDoctorFile(programPath) {
    const cached = scanCache.get(programPath);
    if (cached !== undefined)
        return cached;
    const report = readAndScan(programPath);
    scanCache.set(programPath, report);
    return report;
}
function readAndScan(programPath) {
    let source = "";
    try {
        source = fs.readFileSync(programPath, "utf8");
    }
    catch {
        // A missing file is the runner's error to report; the gate stays quiet
        // so the layers don't talk over each other.
        return { findings: [], red: [], yellow: [] };
    }
    return scanCapabilities(source);
}
export function capabilitySummary(report) {
    if (report.findings.length === 0) {
        return "reads via ctx only — no imports, no network, no writes, no subprocesses";
    }
    const parts = [];
    if (report.red.length > 0) {
        parts.push(`RED: ${[...new Set(report.red.map(f => f.capability))].join(", ")}`);
    }
    if (report.yellow.length > 0) {
        parts.push(`note: ${[...new Set(report.yellow.map(f => f.capability))].join(", ")}`);
    }
    return parts.join(" · ");
}
