"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dedupeGroups = dedupeGroups;
exports.renderReport = renderReport;
const score_1 = require("./score");
const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", ORANGE = "\x1b[38;5;208m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";
const GLYPH = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR = { error: RED, warning: ORANGE, info: YELLOW };
const SEVERITY_ORDER = ["error", "warning", "info"];
function groupSeverity(g) {
    var _a;
    const explicit = g.findings.find(f => f.severity);
    return (_a = (explicit ? (0, score_1.findingSeverity)(g, explicit) : undefined)) !== null && _a !== void 0 ? _a : g.meta.severity;
}
function expandChecks(g) {
    var _a, _b, _c, _d, _e;
    const buckets = new Map();
    for (const f of g.findings) {
        const check = f.rule ? (_a = g.meta.checks) === null || _a === void 0 ? void 0 : _a.find(c => c.id === f.rule) : undefined;
        const key = (_b = f.rule) !== null && _b !== void 0 ? _b : g.meta.id;
        if (!buckets.has(key)) {
            buckets.set(key, {
                ruleId: (_c = f.rule) !== null && _c !== void 0 ? _c : null,
                heading: (_d = check === null || check === void 0 ? void 0 : check.description) !== null && _d !== void 0 ? _d : g.meta.description,
                severity: (_e = check === null || check === void 0 ? void 0 : check.severity) !== null && _e !== void 0 ? _e : g.meta.severity,
                findings: [],
            });
        }
        buckets.get(key).findings.push(f);
    }
    return [...buckets.values()];
}
function dedupeGroups(groups) {
    const seen = new Set();
    const key = (f) => `${f.file}:${f.line}`;
    const ordered = [...groups].sort((a, b) => SEVERITY_ORDER.indexOf(groupSeverity(a)) - SEVERITY_ORDER.indexOf(groupSeverity(b)));
    const out = [];
    let hidden = 0;
    for (const g of ordered) {
        if (g.findings.length === 0) {
            out.push(g);
            continue;
        }
        const kept = [];
        for (const f of g.findings) {
            const k = key(f);
            if (seen.has(k)) {
                hidden++;
                continue;
            }
            seen.add(k);
            kept.push(f);
        }
        if (kept.length > 0)
            out.push({ ...g, findings: kept });
    }
    return { groups: out, hidden };
}
function renderReport(input, useColor) {
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    const lines = [];
    const { groups, hidden } = dedupeGroups(input.groups);
    const total = groups.reduce((n, g) => n + g.findings.length, 0);
    const { score, grade } = (0, score_1.computeScore)(groups);
    const gradeColor = score >= 75 ? GREEN : score >= 50 ? YELLOW : RED;
    lines.push(`✔ Scanned ${input.fileCount} files in ${input.durationMs}ms`);
    lines.push("");
    const doctorWord = groups.length === 1 ? "doctor" : "doctors";
    lines.push(c(`Any Doctor — ${groups.length} ${doctorWord}`, BOLD));
    lines.push(c(`Score: ${score} / 100 — ${grade}`, BOLD + gradeColor));
    if (total === 0) {
        lines.push(c("No issues found", BOLD + GREEN));
        if (groups.length > 1) {
            lines.push("");
            for (const g of groups) {
                lines.push(`${c("✔", GREEN)} ${c(g.meta.id, DIM)} — clean`);
            }
        }
        return lines.join("\n");
    }
    const bySeverity = { error: 0, warning: 0, info: 0 };
    for (const g of groups) {
        for (const f of g.findings)
            bySeverity[(0, score_1.findingSeverity)(g, f)]++;
    }
    const rollup = SEVERITY_ORDER
        .filter(s => bySeverity[s] > 0)
        .map(s => c(`${bySeverity[s]} ${s}`, COLOR[s]))
        .join(", ");
    lines.push("");
    lines.push(`${c(`${total} issue${total === 1 ? "" : "s"} found`, BOLD)}  ${c(`(${rollup})`, DIM)}`);
    for (const { category, counts } of (0, score_1.categoryRollup)(groups)) {
        const catParts = SEVERITY_ORDER.filter(s => counts[s] > 0).map(s => c(`${counts[s]} ${s}`, COLOR[s]));
        if (catParts.length > 0) {
            const cap = category.charAt(0).toUpperCase() + category.slice(1);
            lines.push(`${c(cap + ":", BOLD)} ${catParts.join(", ")}`);
        }
    }
    lines.push("");
    const ordered = [...groups].sort((a, b) => SEVERITY_ORDER.indexOf(groupSeverity(a)) - SEVERITY_ORDER.indexOf(groupSeverity(b)));
    for (const g of ordered) {
        for (const bucket of expandChecks(g)) {
            const n = bucket.findings.length;
            lines.push(`${c(GLYPH[bucket.severity], COLOR[bucket.severity])} ${c(bucket.heading, n > 1 ? BOLD : "")}${n > 1 ? c(` ×${n}`, COLOR[bucket.severity]) : ""}`);
            lines.push(`  ${c(bucket.ruleId ? `${g.meta.id}/${bucket.ruleId}` : g.meta.id, DIM)}`);
            for (const f of bucket.findings.slice(0, 20)) {
                lines.push(`  ${f.file}:${f.line}`);
                if (f.message)
                    lines.push(`    ${c(f.message, DIM)}`);
            }
            if (n > 20)
                lines.push(`  ${c(`… and ${n - 20} more`, DIM)}`);
            lines.push("");
        }
        if (g.meta.blindSpots && g.meta.blindSpots.length > 0) {
            lines.push(`  ${c("blind spots: " + g.meta.blindSpots.join("; "), DIM)}`);
            lines.push("");
        }
    }
    if (hidden > 0) {
        lines.push(c(`${hidden} duplicate finding${hidden === 1 ? "" : "s"} hidden (same location, different doctor)`, DIM));
    }
    return lines.join("\n").replace(/\n+$/, "");
}
