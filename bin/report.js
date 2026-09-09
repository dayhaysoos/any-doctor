import { SEVERITY_ORDER, deriveSummary } from "./summary.js";
import { DEFAULT_EXTS } from "./sdk.js";
import { BOLD, colorizer, DIM, GLYPH, GREEN, RED, scoreHeaderTone, SEVERITY_COLOR, YELLOW } from "./palette.js";
// All doctors scan the same target, so the cohort's file count is any
// doctor's count; the max is the honest pick when one crashed early. The
// policy lives here, beside the RunOutcome field it fills and the Score
// that divides by it.
export function cohortFileCount(counts) {
    return counts.reduce((m, n) => Math.max(m, n), 0);
}
// The one place the skip-note copy lives; report, dashboard, and the CLI
// all render this sentence so the story is identical everywhere. The count
// is always the true total; only the name list caps — three names, then
// "… and N more" — so a hundred malicious doctors still cost one line.
const SKIP_NAMES_SHOWN = 3;
export function unsafeSkipLine(names) {
    const shown = names.slice(0, SKIP_NAMES_SHOWN).join(", ");
    const rest = names.length - SKIP_NAMES_SHOWN;
    const list = rest > 0 ? `${shown} \u2026 and ${rest} more` : shown;
    return `${names.length} doctor${names.length === 1 ? "" : "s"} could be malicious — skipped: ${list}`;
}
// The empty-scan warning's one copy: a run that scanned zero files must
// never read as a clean pass — "No findings" over nothing checked is
// the falsest green there is. The extension list is composed from the
// walk's own DEFAULT_EXTS, so the prose cannot drift from what the walk
// actually reads.
export function emptyScanLine() {
    const exts = DEFAULT_EXTS.join(", ").replace(/, ([^,]*)$/, ", or $1");
    return `nothing to check — no ${exts} sources found (node_modules, hidden dirs, and test paths are skipped; --include-tests opts back in)`;
}
// The refusal for a doctor you explicitly asked to run: the file, its
// capabilities, one line. The runner's DoctorUnsafe renderer and every
// caller share this so the refusal reads identically everywhere; detail
// lines ride beneath it when there are any.
export function unsafeRefusalLine(name, capabilities) {
    return `${name} could be malicious (${capabilities.join(", ")}) — not running it.`;
}
// The report is an adapter over the Summary: the derivation (dedupe,
// score, rollups, check buckets, narrowed ids) lives in summary.ts,
// shared with the dashboard and the future JSON surface — rendering
// here means prose and color, nothing else.
export function renderReport(input, useColor, diff) {
    const c = colorizer(useColor);
    const lines = [];
    const summary = deriveSummary(input);
    const { groups, total, hidden } = summary;
    const sr = summary.score;
    lines.push(`✔ Scanned ${input.fileCount} files in ${input.durationMs}ms`);
    lines.push("");
    const doctorWord = groups.length === 1 ? "doctor" : "doctors";
    lines.push(c(`Any Doctor — ${groups.length} ${doctorWord}`, BOLD));
    lines.push(c(summary.header.scoreLine, BOLD + scoreHeaderTone(sr)));
    if (summary.header.cleanLine) {
        lines.push(c(summary.header.cleanLine, DIM));
    }
    if (input.skippedUnsafe !== undefined && input.skippedUnsafe.length > 0) {
        lines.push(c(`\u26a0 ${unsafeSkipLine(input.skippedUnsafe)}`, YELLOW));
    }
    if (diff !== undefined) {
        lines.push(c(`vs ${diff.base} (merged base): ${diff.added} added · ${diff.resolved} resolved`, DIM));
    }
    // The empty scan is its own outcome, not a clean one: no findings
    // headline, no per-doctor "clean" roll — those are claims a zero-file
    // scan has not earned. Degradation honesty survives it: narrowed
    // notices still render (visible, never silent). (Findings over a
    // zero count are still possible — a doctor reporting files it read
    // outside the default extensions — and fall through to render.)
    if (summary.emptyScan) {
        // "Every doctor crashed" is claimable only when no doctor produced
        // a group at all; a mixed cohort over an empty target still gets
        // the sources story (the crashes are already named above).
        if (input.crashed.length > 0 && groups.length === 0) {
            lines.push(c(`\u26a0 nothing to check — every doctor crashed before completing a scan (${input.crashed.map(cr => cr.id).join(", ")}; details above)`, YELLOW));
        }
        else {
            lines.push(c(`\u26a0 ${emptyScanLine()}`, YELLOW));
        }
        pushNarrowedNotices(lines, summary, c);
        return lines.join("\n");
    }
    if (total === 0) {
        lines.push(c("No findings", BOLD + GREEN));
        if (groups.length > 1) {
            lines.push("");
            for (const g of groups) {
                lines.push(`${c("✔", GREEN)} ${c(g.meta.id, DIM)} — clean`);
            }
        }
        // A clean degraded run must never read as a full-power clean — the
        // narrowed notice renders here too, exactly as it does under
        // findings (D20 Stage 2's own words).
        pushNarrowedNotices(lines, summary, c);
        return lines.join("\n");
    }
    const rollup = SEVERITY_ORDER
        .filter(s => summary.severityCounts[s] > 0)
        .map(s => c(`${summary.severityCounts[s]} ${s}`, SEVERITY_COLOR[s]))
        .join(", ");
    lines.push("");
    lines.push(`${c(`${total} finding${total === 1 ? "" : "s"}`, BOLD)}  ${c(`(${rollup})`, DIM)}`);
    for (const { category, counts } of summary.categories) {
        const catParts = SEVERITY_ORDER.filter(s => counts[s] > 0).map(s => c(`${counts[s]} ${s}`, SEVERITY_COLOR[s]));
        if (catParts.length > 0) {
            const cap = category.charAt(0).toUpperCase() + category.slice(1);
            lines.push(`${c(cap + ":", BOLD)} ${catParts.join(", ")}`);
        }
    }
    lines.push("");
    // The summary's groups are already severity-ordered; sorting again
    // would duplicate it.
    for (const gc of summary.groupChecks) {
        const g = gc.group;
        for (const bucket of gc.checks) {
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
        // The degradation contract as data (D20 Stage 2): checks that declared
        // analysis needs but ran without the engine say so — including checks
        // with zero findings, where a narrowed clean must never read as a
        // full-power clean.
        if (gc.narrowedIds.length > 0) {
            lines.push(`  ${c(narrowedLine(gc.narrowedIds), YELLOW)}`);
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
// The machine adapter: exactly one JSON object, schema-tagged so
// consumers can branch on shape. stdout carries only this when
// --format json is set — human diagnostics (crash detail, gate
// reasons) stay on stderr, so pipes stay parseable. Same Summary the
// prose and the dashboard render; the same facts, no re-derivation.
export function renderJson(input, summary, gate, diff) {
    var _a;
    return JSON.stringify({
        schema: 1,
        tool: "any-doctor",
        target: input.targetDir,
        fileCount: input.fileCount,
        durationMs: input.durationMs,
        score: summary.score,
        counts: { ...summary.severityCounts, total: summary.total, hiddenDuplicates: summary.hidden },
        analysisAvailable: (_a = input.analysisAvailable) !== null && _a !== void 0 ? _a : false,
        emptyScan: summary.emptyScan,
        groups: summary.groupChecks.map(gc => ({
            doctor: gc.group.meta.id,
            checks: gc.checks.map(b => ({
                ...(b.ruleId !== null ? { rule: b.ruleId } : {}),
                heading: b.heading,
                severity: b.severity,
                findings: b.findings.map(f => ({
                    file: f.file,
                    line: f.line,
                    ...(f.severity !== undefined ? { severity: f.severity } : {}),
                    ...(f.message !== undefined ? { message: f.message } : {}),
                })),
            })),
            ...(gc.narrowedIds.length > 0 ? { narrowed: gc.narrowedIds } : {}),
            ...(gc.group.meta.blindSpots !== undefined && gc.group.meta.blindSpots.length > 0 ? { blindSpots: gc.group.meta.blindSpots } : {}),
        })),
        crashed: input.crashed.map(cr => ({ id: cr.id, detail: cr.detail })),
        skippedUnsafe: input.skippedUnsafe,
        gate: {
            failOn: gate.failOn,
            mode: gate.mode,
            fails: gate.fails,
            ...(gate.reason !== null ? { reason: gate.reason } : {}),
        },
        ...(diff !== undefined ? {
            diff: {
                base: diff.base,
                baseSha: diff.baseSha,
                added: diff.added,
                resolved: diff.resolved,
            },
        } : {}),
    }, null, 2);
}
// A diff entry's location includes its rule when it has one — the gate is
// rule-aware (D20), so the line must say which check was missing or extra.
function where(f) {
    return (f.rule ? f.rule + " " : "") + f.file + ":" + f.line;
}
// The narrowed notice's one wording (D20 Stage 2) — one source for every
// branch that renders it (clean, findings, and empty-scan).
function narrowedLine(checkIds) {
    return `narrowed: analysis engine unavailable — ${checkIds.join(", ")} ran in degraded mode`;
}
// Degradation honesty survives every outcome shape: a run without the
// analysis engine says so whether it ended clean, with findings, or —
// over an empty scan — with nothing checked at all (visible, never
// silent). The narrowed ids arrive as Summary data.
function pushNarrowedNotices(lines, summary, c) {
    const notices = summary.groupChecks
        .map((gc) => gc.narrowedIds)
        .filter((ids) => ids.length > 0);
    if (notices.length > 0) {
        lines.push("");
        for (const ids of notices) {
            lines.push(c(narrowedLine(ids), YELLOW));
        }
    }
}
// Verify-gate rendering: pure state -> string, colored on request. The
// command layer prints it and counts failures from the data.
export function renderVerifyResult(result, useColor) {
    const c = colorizer(useColor);
    const lines = [];
    for (const fixture of result.results) {
        if (fixture.skipped !== undefined) {
            // An honest skip is data, not a pass: this fixture pins the
            // analysis-on path and the engine is not installed here.
            lines.push(c("  – " + fixture.name + " — skipped: " + fixture.skipped, DIM));
            continue;
        }
        if (fixture.ok) {
            lines.push(c("  ✔ " + fixture.name, GREEN));
        }
        else {
            lines.push(c("  ✖ " + fixture.name, RED));
            for (const m of fixture.missing)
                lines.push("    " + c("missing expected finding", RED) + " " + where(m));
            for (const u of fixture.unexpected)
                lines.push("    " + c("unexpected finding", RED) + " " + where(u));
            if (fixture.error)
                lines.push("    " + c("crashed: ", RED) + fixture.error);
        }
    }
    return lines.join("\n");
}
