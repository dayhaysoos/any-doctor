"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderReport = renderReport;
const score_1 = require("./score");
const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";
const GLYPH = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR = { error: RED, warning: YELLOW, info: CYAN };
const SEVERITY_ORDER = ["error", "warning", "info"];
function groupSeverity(g) {
    var _a;
    const explicit = g.findings.find(f => f.severity);
    return (_a = (explicit ? explicit.severity : undefined)) !== null && _a !== void 0 ? _a : g.meta.severity;
}
function renderReport(input, useColor) {
    var _a;
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    const lines = [];
    const total = input.groups.reduce((n, g) => n + g.findings.length, 0);
    const { score, grade } = (0, score_1.computeScore)(input.groups);
    const gradeColor = score >= 75 ? GREEN : score >= 50 ? YELLOW : RED;
    lines.push(`✔ Scanned ${input.fileCount} files in ${input.durationMs}ms`);
    lines.push("");
    const doctorWord = input.groups.length === 1 ? "doctor" : "doctors";
    lines.push(c(`Any Doctor — ${input.groups.length} ${doctorWord}`, BOLD));
    lines.push(c(`Score: ${score} / 100 — ${grade}`, BOLD + gradeColor));
    if (total === 0) {
        lines.push(c("No issues found", BOLD + GREEN));
        if (input.groups.length > 1) {
            lines.push("");
            for (const g of input.groups) {
                lines.push(`${c("✔", GREEN)} ${c(g.meta.id, DIM)} — clean`);
            }
        }
        return lines.join("\n");
    }
    const bySeverity = { error: 0, warning: 0, info: 0 };
    for (const g of input.groups) {
        for (const f of g.findings)
            bySeverity[(_a = f.severity) !== null && _a !== void 0 ? _a : g.meta.severity]++;
    }
    const rollup = SEVERITY_ORDER
        .filter(s => bySeverity[s] > 0)
        .map(s => c(`${bySeverity[s]} ${s}`, COLOR[s]))
        .join(", ");
    lines.push("");
    lines.push(`${c(`${total} issue${total === 1 ? "" : "s"} found`, BOLD)}  ${c(`(${rollup})`, DIM)}`);
    for (const { category, counts } of (0, score_1.categoryRollup)(input.groups)) {
        const catParts = SEVERITY_ORDER.filter(s => counts[s] > 0).map(s => c(`${counts[s]} ${s}`, COLOR[s]));
        if (catParts.length > 0) {
            const cap = category.charAt(0).toUpperCase() + category.slice(1);
            lines.push(`${c(cap + ":", BOLD)} ${catParts.join(", ")}`);
        }
    }
    lines.push("");
    const ordered = [...input.groups].sort((a, b) => SEVERITY_ORDER.indexOf(groupSeverity(a)) - SEVERITY_ORDER.indexOf(groupSeverity(b)));
    for (const g of ordered) {
        const n = g.findings.length;
        const sev = groupSeverity(g);
        lines.push(`${c(GLYPH[sev], COLOR[sev])} ${c(g.meta.description, n > 1 ? BOLD : "")}${n > 1 ? c(` ×${n}`, COLOR[sev]) : ""}`);
        lines.push(`  ${c(g.programName.replace(/\.(m|c)?js$/, ""), DIM)}`);
        for (const f of g.findings.slice(0, 20)) {
            lines.push(`  ${f.file}:${f.line}`);
            if (f.message)
                lines.push(`    ${c(f.message, DIM)}`);
        }
        if (n > 20)
            lines.push(`  ${c(`… and ${n - 20} more`, DIM)}`);
        if (g.meta.blindSpots && g.meta.blindSpots.length > 0) {
            lines.push(`  ${c("blind spots: " + g.meta.blindSpots.join("; "), DIM)}`);
        }
        lines.push("");
    }
    return lines.join("\n").replace(/\n+$/, "");
}
