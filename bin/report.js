import { resolveFinding } from "./contract.js";
import { BOLD, colorizer, DIM, GLYPH, gradeColor, GREEN, RED, SEVERITY_COLOR } from "./palette.js";
import { categoryRollup, computeScore, findingSeverity } from "./score.js";
const SEVERITY_ORDER = ["error", "warning", "info"];
function groupSeverity(g) {
    var _a;
    const explicit = g.findings.find(f => f.severity);
    return (_a = (explicit ? findingSeverity(g, explicit) : undefined)) !== null && _a !== void 0 ? _a : g.meta.severity;
}
function expandChecks(g) {
    var _a;
    const buckets = new Map();
    for (const f of g.findings) {
        const j = resolveFinding(g.meta, f);
        if (!buckets.has(j.checkKey)) {
            buckets.set(j.checkKey, {
                ruleId: (_a = f.rule) !== null && _a !== void 0 ? _a : null,
                heading: j.description,
                severity: j.declaredSeverity,
                findings: [],
            });
        }
        buckets.get(j.checkKey).findings.push(f);
    }
    return [...buckets.values()];
}
export function dedupeGroups(groups) {
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
export function renderReport(input, useColor) {
    const c = colorizer(useColor);
    const lines = [];
    const { groups, hidden } = dedupeGroups(input.groups);
    const total = groups.reduce((n, g) => n + g.findings.length, 0);
    const { score, grade } = computeScore(groups);
    lines.push(`✔ Scanned ${input.fileCount} files in ${input.durationMs}ms`);
    lines.push("");
    const doctorWord = groups.length === 1 ? "doctor" : "doctors";
    lines.push(c(`Any Doctor — ${groups.length} ${doctorWord}`, BOLD));
    lines.push(c(`Score: ${score} / 100 — ${grade}`, BOLD + gradeColor(score)));
    if (total === 0) {
        lines.push(c("No findings", BOLD + GREEN));
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
            bySeverity[findingSeverity(g, f)]++;
    }
    const rollup = SEVERITY_ORDER
        .filter(s => bySeverity[s] > 0)
        .map(s => c(`${bySeverity[s]} ${s}`, SEVERITY_COLOR[s]))
        .join(", ");
    lines.push("");
    lines.push(`${c(`${total} finding${total === 1 ? "" : "s"}`, BOLD)}  ${c(`(${rollup})`, DIM)}`);
    for (const { category, counts } of categoryRollup(groups)) {
        const catParts = SEVERITY_ORDER.filter(s => counts[s] > 0).map(s => c(`${counts[s]} ${s}`, SEVERITY_COLOR[s]));
        if (catParts.length > 0) {
            const cap = category.charAt(0).toUpperCase() + category.slice(1);
            lines.push(`${c(cap + ":", BOLD)} ${catParts.join(", ")}`);
        }
    }
    lines.push("");
    // dedupeGroups already orders by severity; sorting again would duplicate it.
    for (const g of groups) {
        for (const bucket of expandChecks(g)) {
            const n = bucket.findings.length;
            lines.push(`${c(GLYPH[bucket.severity], SEVERITY_COLOR[bucket.severity])} ${c(bucket.heading, n > 1 ? BOLD : "")}${n > 1 ? c(` ×${n}`, SEVERITY_COLOR[bucket.severity]) : ""}`);
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
        if (g.findings.length > 0 && g.meta.blindSpots && g.meta.blindSpots.length > 0) {
            lines.push(`  ${c("blind spots: " + g.meta.blindSpots.join("; "), DIM)}`);
            lines.push("");
        }
    }
    if (hidden > 0) {
        lines.push(c(`${hidden} duplicate finding${hidden === 1 ? "" : "s"} hidden (same location, different doctor)`, DIM));
    }
    return lines.join("\n").replace(/\n+$/, "");
}
// Verify-gate rendering: pure state -> string, colored on request. The
// command layer prints it and counts failures from the data.
export function renderVerifyResult(result, useColor) {
    const c = colorizer(useColor);
    const lines = [];
    for (const fixture of result.results) {
        if (fixture.ok) {
            lines.push(c("  ✔ " + fixture.name, GREEN));
        }
        else {
            lines.push(c("  ✖ " + fixture.name, RED));
            for (const m of fixture.missing)
                lines.push("    " + c("missing expected finding", RED) + " " + m.file + ":" + m.line);
            for (const u of fixture.unexpected)
                lines.push("    " + c("unexpected finding", RED) + " " + u.file + ":" + u.line);
            if (fixture.error)
                lines.push("    " + c("crashed: ", RED) + fixture.error);
        }
    }
    return lines.join("\n");
}
