import * as fs from "fs";
import * as path from "path";
import { copyToClipboard } from "./clipboard.js";
import { resolveFinding, runCommandFor } from "./contract.js";
import { scoreFromFileHealth, scoreHeaderLines } from "./score.js";
import { processTtyEnv } from "./tty.js";
import * as tty from "./tty.js";
import { runTty, truncateVisible, visibleWidth } from "./tty.js";
import { BOLD, colorizer, DIM, GLYPH, GREEN, ORANGE, RESET, scoreHeaderTone, SEVERITY_COLOR, YELLOW } from "./palette.js";
import { dedupeGroups, unsafeSkipLine } from "./report.js";
const SPLIT_MIN_COLS = 100;
const TOKEN_RE = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^'\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|if|else|for|while|await|async|try|catch|finally|import|export|from|new|class|extends|throw|typeof|instanceof|in|of|do|switch|case|break|continue|default|yield)\b|\b(\d+(?:\.\d+)?)\b/g;
export function highlightCode(line, useColor) {
    if (!useColor)
        return line;
    return line.replace(TOKEN_RE, (m, comment, str, kw, num) => {
        if (comment)
            return DIM + m + RESET;
        if (str)
            return "\x1b[38;5;114m" + m + RESET;
        if (kw)
            return "\x1b[38;5;75m" + m + RESET;
        if (num)
            return ORANGE + m + RESET;
        return m;
    });
}
export function scoreBar(score, width) {
    const filled = Math.round((score / 100) * width);
    return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}
export function buildItems(groups) {
    const items = [];
    for (const g of groups) {
        for (const f of g.findings) {
            const j = resolveFinding(g.meta, f);
            items.push({ ...j, readKey: j.checkKey + "@" + f.file + ":" + f.line, site: f });
        }
    }
    return items;
}
// ---- copy prompts ----
//
// Enter copies the selected finding; `c` copies at whatever level the
// selection rests on — one finding, a whole check (the overarching
// explanation plus every site), or an entire doctor. The bulk prompt is
// the natural agent task: "fix this pattern everywhere it appears."
function promptHeading(severity, description, checkKey) {
    return `${severity.toUpperCase()} · ${description} (${checkKey})`;
}
function scopeTail(scopeLine, verifyCommand, plural = false) {
    return [
        "",
        "Scope:",
        scopeLine,
        `- Fix the root cause; do not suppress, disable, or silence ${plural ? "any of these checks" : "the check"}.`,
        "- Keep unrelated refactors out of this pass.",
        "",
        `Verify with \`${verifyCommand}\` and confirm the finding${plural ? "s are" : " is"} gone before moving on.`,
    ];
}
export function fixPrompt(item, verifyCommand) {
    const site = item.site;
    const lines = [
        "Fix exactly one any-doctor finding:",
        "",
        promptHeading(item.severity, item.description, item.checkKey),
        "",
        `Affected site: ${site.file}:${site.line}`,
    ];
    if (item.impact)
        lines.push("", "Impact " + item.impact);
    if (item.why)
        lines.push("", "Why " + item.why);
    if (item.fix)
        lines.push("", "Suggested fix: " + item.fix);
    lines.push(...scopeTail(`- Fix only ${item.checkKey} at this site.`, verifyCommand));
    return lines.join("\n");
}
// The re-scan loop is the pagination for display; a copied task still
// lists generously, then defers the remainder to the next run.
const PROMPT_SITES_CAP = 100;
function sitesOf(items, cap) {
    const shown = items.slice(0, cap);
    return {
        lines: shown.map(i => `- ${i.site.file}:${i.site.line}`),
        hidden: items.length - shown.length,
    };
}
function pushSites(lines, sites) {
    lines.push(...sites.lines);
    if (sites.hidden > 0) {
        lines.push(`- … and ${sites.hidden} more — fix this batch, then re-run for the rest`);
    }
}
export function checkFixPrompt(items, verifyCommand) {
    const check = summarizeCheck(items[0].checkKey, items);
    const lines = [
        "Fix every finding of one any-doctor check:",
        "",
        promptHeading(check.severity, check.description, check.checkKey),
        "",
        `${check.count} finding${check.count === 1 ? "" : "s"} across ${check.files} file${check.files === 1 ? "" : "s"}:`,
    ];
    pushSites(lines, sitesOf(items, PROMPT_SITES_CAP));
    if (check.impact)
        lines.push("", "Impact " + check.impact);
    if (check.why)
        lines.push("", "Why " + check.why);
    if (check.fix)
        lines.push("", "Suggested fix: " + check.fix);
    lines.push(...scopeTail(`- Fix ${check.checkKey} at every listed site — as many as practical in one pass.`, verifyCommand, true));
    return lines.join("\n");
}
// Doctor prompts list generously per check but not boundlessly; the
// re-run note carries the remainder.
const DOCTOR_PROMPT_SITES_PER_CHECK = 25;
export function doctorFixPrompt(doc, group, verifyCommand) {
    var _a;
    const lines = [
        "Fix the findings of one any-doctor program:",
        "",
        `${doc.worst.toUpperCase()} · ${doc.doctorId} — ${doc.count} finding${doc.count === 1 ? "" : "s"} across ${doc.files} file${doc.files === 1 ? "" : "s"}`,
    ];
    for (const g of (_a = group === null || group === void 0 ? void 0 : group.checks) !== null && _a !== void 0 ? _a : []) {
        {
            const summary = summarizeCheck(g.checkKey, g.items);
            lines.push("", `${summary.severity.toUpperCase()} · ${summary.description} (${summary.checkKey}) — ${summary.count} finding${summary.count === 1 ? "" : "s"}`);
            if (summary.why)
                lines.push("Why " + summary.why);
            if (summary.fix)
                lines.push("Suggested fix: " + summary.fix);
            pushSites(lines, sitesOf(g.items, DOCTOR_PROMPT_SITES_PER_CHECK));
        }
    }
    lines.push(...scopeTail(`- Fix every check of ${doc.doctorId} at the listed sites — as many as practical in one pass.`, verifyCommand, true));
    return lines.join("\n");
}
function padVisible(s, width) {
    return s + " ".repeat(Math.max(0, width - visibleWidth(s)));
}
function wordWrap(text, width) {
    if (!text)
        return [];
    const words = text.split(/\s+/);
    const lines = [];
    let current = "";
    for (const word of words) {
        if (!current) {
            current = word;
            continue;
        }
        if (current.length + 1 + word.length <= width)
            current += " " + word;
        else {
            lines.push(current);
            current = word;
        }
    }
    if (current)
        lines.push(current);
    return lines;
}
// Fixed chrome around the body: 4 header lines, 2 blank spacers, 2 footer
// lines (the notice line is always reserved), plus the bottom terminal row,
// which is never written so no repaint can make the terminal scroll.
const CHROME_ROWS = 9;
export function resolveDashboardLayout(cols, rows, itemCount) {
    const bodyRows = Math.max(1, rows - CHROME_ROWS);
    if (cols >= SPLIT_MIN_COLS) {
        const listWidth = Math.min(56, Math.max(32, Math.floor(cols * 0.44)));
        const detailWidth = cols - listWidth - 2;
        return { mode: "split", listWidth, detailWidth, listHeight: bodyRows, detailHeight: bodyRows, bodyRows };
    }
    const listHeight = Math.min(Math.max(2, Math.ceil(bodyRows * 0.4)), Math.max(1, itemCount));
    return {
        mode: "stacked",
        listWidth: cols,
        detailWidth: cols,
        listHeight,
        detailHeight: Math.max(1, bodyRows - listHeight - 2),
        bodyRows,
    };
}
// The re-scan loop is the pagination: a check shows its first N findings,
// then an affordance to fix a few and run again.
export const FINDINGS_PER_CHECK = 50;
const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };
export function buildTree(items, filesTotal) {
    var _a;
    const byDoctor = new Map();
    for (const it of items) {
        let checks = byDoctor.get(it.doctorId);
        if (!checks) {
            checks = new Map();
            byDoctor.set(it.doctorId, checks);
        }
        const group = (_a = checks.get(it.checkKey)) !== null && _a !== void 0 ? _a : [];
        group.push(it);
        checks.set(it.checkKey, group);
    }
    const doctors = [...byDoctor.entries()].map(([doctorId, checks]) => {
        const entries = [...checks.entries()].map(([checkKey, list]) => ({
            checkKey,
            items: [...list].sort((a, b) => a.site.file === b.site.file
                ? a.site.line - b.site.line
                : a.site.file < b.site.file ? -1 : 1),
        })).sort((a, b) => {
            const sa = SEVERITY_RANK[a.items[0].declaredSeverity];
            const sb = SEVERITY_RANK[b.items[0].declaredSeverity];
            return sa !== sb ? sa - sb : b.items.length - a.items.length || (a.checkKey < b.checkKey ? -1 : 1);
        });
        return {
            doctorId,
            checks: entries,
            multiCheck: entries.length > 1,
            count: entries.reduce((n, g) => n + g.items.length, 0),
            worst: entries.reduce((w, g) => (SEVERITY_RANK[g.items[0].severity] < SEVERITY_RANK[w] ? g.items[0].severity : w), "info"),
            score: scoreFromFileHealth(entries.flatMap(g => g.items.map(it => ({ file: it.site.file, severity: it.severity }))), filesTotal),
        };
    });
    // Triage order: worst severity first, then most findings, then name.
    return doctors.sort((a, b) => SEVERITY_RANK[a.worst] - SEVERITY_RANK[b.worst]
        || b.count - a.count
        || (a.doctorId < b.doctorId ? -1 : 1));
}
export function summarizeCheck(checkKey, groupItems) {
    const first = groupItems[0];
    const files = new Set(groupItems.map(i => i.site.file));
    return {
        checkKey,
        checkId: first.checkId,
        doctorId: first.doctorId,
        description: first.description,
        severity: first.declaredSeverity,
        impact: first.impact,
        why: first.why,
        fix: first.fix,
        blindSpots: first.blindSpots,
        count: groupItems.length,
        files: files.size,
    };
}
export function summarizeDoctor(d) {
    var _a;
    const first = (_a = d.checks[0]) === null || _a === void 0 ? void 0 : _a.items[0];
    const files = new Set();
    for (const g of d.checks)
        for (const i of g.items)
            files.add(i.site.file);
    return {
        doctorId: d.doctorId,
        description: first ? first.description : d.doctorId,
        worst: d.worst,
        count: d.count,
        files: files.size,
        score: d.score,
        checks: d.checks.map(g => ({
            description: g.items[0].description,
            severity: g.items[0].declaredSeverity,
            count: g.items.length,
        })),
        blindSpots: first === null || first === void 0 ? void 0 : first.blindSpots,
    };
}
// Errors open on entry: any doctor carrying error findings, any
// error-severity check, and the top of the list so the first screen is
// never an empty overview. Everything else starts collapsed.
export function initialExpanded(tree) {
    const expanded = new Set();
    const multiDoctor = tree.length > 1;
    tree.forEach((d, i) => {
        if (multiDoctor && (d.worst === "error" || i === 0))
            expanded.add(d.doctorId);
        if (!d.multiCheck)
            return;
        for (const g of d.checks) {
            if (g.items[0].declaredSeverity === "error")
                expanded.add(g.checkKey);
        }
    });
    return expanded;
}
// The one way to ask what a row toggles — doctor rows answer their
// doctorId, check rows their checkKey, everything else nothing.
function toggleKeyOf(row) {
    return row === null || row === void 0 ? void 0 : row.toggleKey;
}
export function buildListRows(tree, useColor, selectedRow, readKeys, expanded) {
    const c = colorizer(useColor);
    const open = expanded !== null && expanded !== void 0 ? expanded : new Set();
    const multiDoctor = tree.length > 1;
    const rows = [];
    for (const d of tree) {
        if (!multiDoctor) {
            rows.push({
                kind: "section",
                text: c(d.doctorId, BOLD),
                severity: d.worst,
                selectable: false,
            });
        }
        else {
            // The dashboard is the selection surface: every doctor is a
            // collapsible row, severity-ordered, with its total count. The
            // row's score obeys the header's honesty: a doctor over zero
            // scanned files shows n/a — never a green vacuous 100.
            const summary = summarizeDoctor(d);
            const rowIndex = rows.length;
            const isOpen = open.has(d.doctorId);
            // The row's score rides the header's tone policy — n/a in yellow
            // over an empty denominator, never a green vacuous 100.
            const scoreBit = c("· " + (summary.score.filesTotal === 0 ? "n/a" : summary.score.score), scoreHeaderTone(summary.score));
            rows.push({
                kind: "section",
                text: `${selectedRow === rowIndex ? c("›", BOLD) : " "}${c(isOpen ? "▾" : "▸", DIM)} ${c(GLYPH[summary.worst], SEVERITY_COLOR[summary.worst])} ${c(summary.doctorId, BOLD)} ${c("×" + summary.count, DIM)} ${scoreBit}`,
                severity: summary.worst,
                selectable: true,
                doctor: summary,
                toggleKey: d.doctorId,
            });
            if (!isOpen)
                continue;
        }
        // Children of a doctor row: checks for multi-check doctors, capped
        // flat findings for single-check ones. Tree connectors make the
        // hierarchy structural — and they follow the DOCTOR's shape, not the
        // frame's: one multi-check doctor run directly nests exactly like the
        // aggregate. Only a single-check doctor alone in a single-doctor
        // frame is flat.
        const nested = multiDoctor || d.multiCheck;
        const childPrefix = (ci, last) => nested ? (ci < last ? "  \u251c\u2500 " : "  \u2514\u2500 ") : multiDoctor ? "  " : "";
        const guidePrefix = (ci, last) => nested ? (ci < last ? "  \u2502    " : "       ") : multiDoctor ? "  " : "";
        if (!d.multiCheck) {
            // Flat findings, capped like checks; the re-scan loop is the
            // pagination.
            const all = d.checks[0].items;
            const flat = all.slice(0, FINDINGS_PER_CHECK);
            flat.forEach((it, ci) => {
                const rowIndex = rows.length;
                rows.push({
                    kind: "item",
                    text: childPrefix(ci, flat.length - 1 + (all.length > flat.length ? 1 : 0)) + itemRowText(it, selectedRow === rowIndex, readKeys, c, !multiDoctor),
                    severity: it.severity,
                    selectable: true,
                    item: it,
                });
            });
            if (all.length > flat.length) {
                const moreRowIndex = rows.length;
                rows.push({
                    kind: "more",
                    // The payload makes selecting this row informative (the doctor's
                    // story) instead of a blank detail pane, and lets `c` copy the
                    // group task from here like from the check row.
                    text: childPrefix(flat.length, flat.length) + `${selectedRow === moreRowIndex ? c("›", BOLD) + " " : ""}${c("… and " + (all.length - flat.length) + " more — fix a few and re-scan", DIM)}`,
                    severity: d.worst,
                    selectable: true,
                    doctor: summarizeDoctor(d),
                });
            }
            continue;
        }
        d.checks.forEach((g, ci) => {
            const summary = summarizeCheck(g.checkKey, g.items);
            const checkRowIndex = rows.length;
            const isOpen = open.has(g.checkKey);
            const arrow = isOpen ? "\u25be" : "\u25b8";
            rows.push({
                kind: "check",
                text: childPrefix(ci, d.checks.length - 1)
                    + `${selectedRow === checkRowIndex ? c("›", BOLD) : " "}${c(arrow, DIM)} ${c(GLYPH[summary.severity], SEVERITY_COLOR[summary.severity])} ${c(summary.description, selectedRow === checkRowIndex ? BOLD : undefined)} ${c("×" + summary.count, DIM)}`,
                severity: summary.severity,
                selectable: true,
                check: summary,
                toggleKey: g.checkKey,
            });
            if (!isOpen)
                return;
            const shown = g.items.slice(0, FINDINGS_PER_CHECK);
            shown.forEach(it => {
                const rowIndex = rows.length;
                rows.push({
                    kind: "item",
                    text: guidePrefix(ci, d.checks.length - 1) + itemRowText(it, selectedRow === rowIndex, readKeys, c, false),
                    severity: it.severity,
                    selectable: true,
                    item: it,
                });
            });
            if (g.items.length > shown.length) {
                const moreRowIndex = rows.length;
                rows.push({
                    kind: "more",
                    text: guidePrefix(ci, d.checks.length - 1) + `${selectedRow === moreRowIndex ? c("›", BOLD) + " " : ""}${c("… and " + (g.items.length - shown.length) + " more — fix a few and re-scan", DIM)}`,
                    severity: summary.severity,
                    selectable: true,
                    check: summary,
                });
            }
        });
    }
    return rows;
}
function itemRowText(it, isSelected, readKeys, c, showCheckId = true) {
    const isRead = readKeys.has(it.readKey);
    const glyph = c(GLYPH[it.severity], SEVERITY_COLOR[it.severity]);
    const wrap = isSelected ? BOLD : isRead ? DIM : undefined;
    const suffix = showCheckId && it.checkId !== it.doctorId ? c("  " + it.checkId, DIM) : "";
    return `${isSelected ? c("›", BOLD) : " "}${glyph} ${c(it.site.file + ":" + it.site.line, wrap)}${suffix}`;
}
export function dashboardFrame(state) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const { tree, selectedRow, readKeys, useColor, cols, rows } = state;
    const c = colorizer(useColor);
    const findings = tree.flatMap(d => d.checks.flatMap(g => g.items));
    const layout = resolveDashboardLayout(cols, rows, findings.length);
    const barWidth = Math.min(46, Math.max(16, cols - 60));
    // The header is the SELECTED doctor's report — never a cohort total,
    // which read as belonging to whichever row was on screen. Rows are
    // needed first: the selection's payload names the doctor.
    const rowsData = buildListRows(tree, useColor, selectedRow, readKeys, state.expanded);
    const sel = rowsData[selectedRow];
    const scopedId = (_f = (_d = (_b = (_a = sel === null || sel === void 0 ? void 0 : sel.doctor) === null || _a === void 0 ? void 0 : _a.doctorId) !== null && _b !== void 0 ? _b : (_c = sel === null || sel === void 0 ? void 0 : sel.check) === null || _c === void 0 ? void 0 : _c.doctorId) !== null && _d !== void 0 ? _d : (_e = sel === null || sel === void 0 ? void 0 : sel.item) === null || _e === void 0 ? void 0 : _e.doctorId) !== null && _f !== void 0 ? _f : (_g = tree[0]) === null || _g === void 0 ? void 0 : _g.doctorId;
    const scoped = tree.find(d => d.doctorId === scopedId);
    // The header's third line, one shape for every header state — a
    // count, the clean fraction (or the raw file count when there is
    // none), and the run's duration. Composed three ways before, which is
    // how format drift starts.
    const summaryLine = (count, cleanLine, ms) => `${count} finding${count === 1 ? "" : "s"} · ${cleanLine !== null && cleanLine !== void 0 ? cleanLine : state.filesTotal + " file" + (state.filesTotal === 1 ? "" : "s")} · ${ms}ms`;
    const headerLines = [];
    if (scoped) {
        const h = scoreHeaderLines(scoped.score);
        const tone = scoreHeaderTone(scoped.score);
        headerLines.push(`${c(scoped.doctorId, BOLD)}  ${c(h.scoreLine, BOLD + tone)}`);
        // An empty scan draws an empty bar: nothing was measured, and a
        // filled bar would assert the vacuous 100 the n/a line just refused.
        headerLines.push(c(scoreBar(h.emptyScan ? 0 : scoped.score.score, barWidth), tone));
        headerLines.push(c(summaryLine(scoped.count, h.cleanLine, state.durationMs), DIM));
    }
    else if (state.filesTotal === 0) {
        // Zero groups over zero files: the same n/a the report renders —
        // composed through the public score surface, not re-worded here.
        const empty = scoreFromFileHealth([], 0);
        const h = scoreHeaderLines(empty);
        const tone = scoreHeaderTone(empty);
        headerLines.push(c(h.scoreLine, BOLD + tone));
        headerLines.push(c(scoreBar(0, barWidth), tone));
        headerLines.push(c(summaryLine(0, h.cleanLine, state.durationMs), DIM));
    }
    else {
        headerLines.push(c("No findings", BOLD + GREEN));
        headerLines.push(c(scoreBar(100, barWidth), GREEN));
        headerLines.push(c(summaryLine(0, null, state.durationMs), DIM));
    }
    if (state.skippedUnsafe !== undefined && state.skippedUnsafe.length > 0) {
        headerLines.push(c(`\u26a0 ${unsafeSkipLine(state.skippedUnsafe)}`, YELLOW));
    }
    headerLines.push("");
    const viewport = Math.max(1, Math.min(layout.listHeight, layout.bodyRows));
    let firstVisible = Math.max(0, Math.min(selectedRow - viewport + 1, Math.max(0, rowsData.length - viewport)));
    if (selectedRow >= 0 && selectedRow < firstVisible)
        firstVisible = selectedRow;
    const visibleRows = rowsData.slice(firstVisible, firstVisible + viewport);
    const listLines = [];
    for (const row of visibleRows) {
        listLines.push(truncateVisible(row.text, layout.listWidth));
    }
    while (listLines.length < viewport)
        listLines.push("");
    const detail = [];
    const selRow = rowsData[selectedRow];
    if (selRow === null || selRow === void 0 ? void 0 : selRow.item) {
        const sel = selRow.item;
        detail.push(c(`${sel.site.file}:${sel.site.line}`, BOLD));
        detail.push(c(`${cap(sel.category)} · ${sel.severity}`, DIM));
        detail.push("");
        const impact = (_h = sel.impact) !== null && _h !== void 0 ? _h : sel.description;
        for (const l of wordWrap(impact, layout.detailWidth - 2))
            detail.push(c(l, SEVERITY_COLOR[sel.severity]));
        detail.push("");
        proseSection(detail, "Why", (_j = sel.why) !== null && _j !== void 0 ? _j : "Not documented for this check.", layout.detailWidth - 2, c);
        detail.push("");
        detail.push(c("Code", DIM));
        for (const l of codeFrameLines(state.readSource(sel.site.file), sel.site.line, layout.detailWidth - 2, useColor))
            detail.push("  " + l);
        detail.push("");
        if (sel.fix)
            proseSection(detail, "Fix", sel.fix, layout.detailWidth - 2, c);
        detail.push(...blindSpotLines(sel.blindSpots, layout.detailWidth - 2, c));
    }
    else if (selRow === null || selRow === void 0 ? void 0 : selRow.doctor) {
        const d = selRow.doctor;
        detail.push(c(d.doctorId, BOLD));
        detail.push(c(`${d.count} finding${d.count === 1 ? "" : "s"} across ${d.files} file${d.files === 1 ? "" : "s"} · worst ${d.worst}`, DIM));
        detail.push("");
        for (const ck of d.checks) {
            detail.push(`${c(GLYPH[ck.severity], SEVERITY_COLOR[ck.severity])} ${c(ck.description, d.checks.length > 1 ? BOLD : undefined)} ${c("×" + ck.count, DIM)}`);
        }
        detail.push(...blindSpotLines(d.blindSpots, layout.detailWidth - 2, c));
    }
    else if (selRow === null || selRow === void 0 ? void 0 : selRow.check) {
        // A check row (or its "… and N more" affordance) tells the check's
        // story: what it catches, why it matters, how to fix it, and the
        // blast radius.
        const s = selRow.check;
        detail.push(c(s.checkKey, BOLD));
        detail.push(c(`${s.count} finding${s.count === 1 ? "" : "s"} across ${s.files} file${s.files === 1 ? "" : "s"} · ${s.severity}`, DIM));
        detail.push("");
        for (const l of wordWrap(s.description, layout.detailWidth - 2))
            detail.push(c(l, SEVERITY_COLOR[s.severity]));
        if (s.impact) {
            detail.push("");
            proseSection(detail, "Impact", s.impact, layout.detailWidth - 2, c);
        }
        if (s.why) {
            detail.push("");
            proseSection(detail, "Why", s.why, layout.detailWidth - 2, c);
        }
        if (s.fix) {
            detail.push("");
            proseSection(detail, "Fix", s.fix, layout.detailWidth - 2, c);
        }
        detail.push(...blindSpotLines(s.blindSpots, layout.detailWidth - 2, c));
    }
    // The body always renders exactly layout.bodyRows lines so the frame
    // height is constant (rows - 1) in every state.
    const body = [];
    if (layout.mode === "split") {
        for (let i = 0; i < layout.bodyRows; i++) {
            body.push(padVisible(truncateVisible((_k = listLines[i]) !== null && _k !== void 0 ? _k : "", layout.listWidth), layout.listWidth) + "  " + ((_l = detail[i]) !== null && _l !== void 0 ? _l : ""));
        }
    }
    else {
        const stacked = [
            ...listLines,
            "",
            c("─".repeat(Math.max(10, Math.min(cols - 2, 80))), DIM),
            ...detail,
        ];
        for (let i = 0; i < layout.bodyRows; i++)
            body.push((_m = stacked[i]) !== null && _m !== void 0 ? _m : "");
    }
    // Fixed-shape footer: the notice line is always present (blank when idle)
    // so showing or clearing a notice never changes the frame height.
    const footer = [
        state.notice ? c("✔ " + state.notice, GREEN) : "",
        c("↑↓ move · →← expand · enter copy finding · c copy group · q quit", DIM),
    ];
    return [...headerLines, "", ...body, "", ...footer].join("\n");
}
function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
// The shared tail of every detail story: a labeled prose section and the
// blind-spot footnote. The item, check, and doctor branches differ in
// their headers and rollups, not in how prose renders.
function proseSection(detail, label, text, width, c) {
    detail.push(c(label, DIM));
    for (const l of wordWrap(text, width))
        detail.push("  " + l);
}
function blindSpotLines(blindSpots, width, c) {
    if (!blindSpots || blindSpots.length === 0)
        return [];
    return wordWrap("blind spots: " + blindSpots.join("; "), width).map(l => c("  " + l, DIM));
}
function codeFrameLines(source, line, width, useColor) {
    var _a;
    const c = colorizer(useColor);
    const out = [];
    if (source === null) {
        out.push(c("  (source unavailable)", DIM));
        return out;
    }
    const from = Math.max(0, line - 3);
    const to = Math.min(source.length, line + 2);
    for (let i = from; i < to; i++) {
        const marker = i === line - 1 ? c(">  ", BOLD) : "   ";
        const num = c(String(i + 1).padStart(3), DIM);
        const text = truncateVisible((_a = source[i]) !== null && _a !== void 0 ? _a : "", Math.max(10, width));
        out.push(`${marker} ${num} │ ${highlightCode(text, useColor)}`);
    }
    return out;
}
export async function runDashboard(input) {
    await runDashboardOn(processTtyEnv(), input);
}
export async function runDashboardOn(env, input, deps = {}) {
    const { stdout } = env;
    if (!tty.canRunTui(env))
        return;
    const useColor = input.useColor;
    // One RunOutcome, one story on every surface: the tree AND the score
    // consume the same deduplicated groups the report renders — counts and
    // score can never disagree between surfaces.
    const { groups: deduped } = dedupeGroups(input.outcome.groups);
    const tree = buildTree(buildItems(deduped), input.outcome.fileCount);
    const expanded = initialExpanded(tree);
    const readKeys = new Set();
    let notice;
    const currentRows = () => buildListRows(tree, useColor, selectedRow, readKeys, expanded);
    let selectedRow = (() => {
        const rows = buildListRows(tree, useColor, 0, new Set(), expanded);
        const first = rows.findIndex(r => r.selectable);
        return first === -1 ? 0 : first;
    })();
    // A review session re-reads the same files on every selection; caching
    // keeps keypresses off the disk (the frame shows the session-start view).
    const sourceCache = new Map();
    const readSource = (file) => {
        if (sourceCache.has(file))
            return sourceCache.get(file);
        let lines = null;
        try {
            lines = fs.readFileSync(path.resolve(input.outcome.targetDir, file), "utf8").split("\n");
        }
        catch {
            lines = null;
        }
        sourceCache.set(file, lines);
        return lines;
    };
    const verifyCmdFor = (doctorId) => {
        const doctorPath = input.outcome.doctorPaths.get(doctorId);
        if (doctorPath === undefined)
            return "(doctor path unknown — re-run from the CLI)";
        return runCommandFor(doctorPath, input.outcome.targetDir, input.invoker);
    };
    const copy = (text, what) => {
        var _a;
        notice = ((_a = deps.copy) !== null && _a !== void 0 ? _a : copyToClipboard)(text)
            ? `${what} — paste into your agent`
            : "clipboard unavailable";
    };
    const frame = () => {
        try {
            const selRow = currentRows()[selectedRow];
            if (selRow === null || selRow === void 0 ? void 0 : selRow.item)
                readKeys.add(selRow.item.readKey);
            return dashboardFrame({
                tree,
                selectedRow,
                readKeys,
                readSource,
                expanded,
                filesTotal: input.outcome.fileCount,
                durationMs: input.outcome.durationMs,
                useColor,
                notice,
                skippedUnsafe: input.outcome.skippedUnsafe,
                cols: stdout.columns || 120,
                rows: stdout.rows || 34,
            });
        }
        catch (e) {
            const err = e;
            return "DASHBOARD RENDER ERROR — the view is frozen, press q to quit.\n"
                + "Send a screenshot of this to the maintainer:\n\n"
                + String(err && err.stack ? err.stack : err);
        }
    };
    const step = (dir) => {
        const rows = currentRows();
        let next = selectedRow + dir;
        while (next >= 0 && next < rows.length && !rows[next].selectable)
            next += dir;
        if (next >= 0 && next < rows.length)
            selectedRow = next;
        notice = undefined;
    };
    await runTty({
        stdin: env.stdin,
        stdout,
        frame,
        onKey: (key, finish) => {
            var _a, _b, _c;
            if (key === "q" || key === "\x03" || key === "esc")
                return finish();
            if (key === "ignore")
                return;
            if (key === "up" || key === "k")
                return step(-1);
            if (key === "down" || key === "j")
                return step(1);
            const rows = currentRows();
            const row = rows[selectedRow];
            const rowKey = toggleKeyOf(row);
            if (key === "c") {
                // Copy at the level you're on: one finding, a whole check, or an
                // entire doctor — the bulk task is the natural agent unit.
                if (row === null || row === void 0 ? void 0 : row.item) {
                    copy(fixPrompt(row.item, verifyCmdFor(row.item.doctorId)), "copied finding");
                }
                else if (row === null || row === void 0 ? void 0 : row.check) {
                    const check = row.check;
                    const items = (_c = (_b = (_a = tree.find(d => d.doctorId === check.doctorId)) === null || _a === void 0 ? void 0 : _a.checks.find(g => g.checkKey === check.checkKey)) === null || _b === void 0 ? void 0 : _b.items) !== null && _c !== void 0 ? _c : [];
                    copy(checkFixPrompt(items, verifyCmdFor(check.doctorId)), `copied ${items.length} findings from ${check.checkKey}`);
                }
                else if (row === null || row === void 0 ? void 0 : row.doctor) {
                    const doctor = row.doctor;
                    const group = tree.find(d => d.doctorId === doctor.doctorId);
                    copy(doctorFixPrompt(doctor, group, verifyCmdFor(doctor.doctorId)), `copied ${doctor.count} findings from ${doctor.doctorId}`);
                }
                return;
            }
            if (key === "right") {
                if (rowKey)
                    expanded.add(rowKey);
                notice = undefined;
                return;
            }
            if (key === "left" || key === "\x7f" || key === "\b") {
                // Back climbs one level: a finding collapses to its check, a
                // check (or anything beneath a collapsed toggle) collapses to its
                // doctor — landing on the parent so you can select through again.
                const collapseUp = (from) => {
                    let i = from;
                    while (i >= 0 && toggleKeyOf(rows[i]) === undefined)
                        i--;
                    if (i < 0)
                        return;
                    const toggleKey = toggleKeyOf(rows[i]);
                    if (expanded.has(toggleKey)) {
                        expanded.delete(toggleKey);
                        selectedRow = i;
                        return;
                    }
                    // Already collapsed (we're ON it): climb to its parent toggle.
                    let j = i - 1;
                    while (j >= 0 && toggleKeyOf(rows[j]) === undefined)
                        j--;
                    if (j < 0)
                        return;
                    expanded.delete(toggleKeyOf(rows[j]));
                    selectedRow = j;
                };
                collapseUp(selectedRow);
                notice = undefined;
                return;
            }
            if (key === "\r" || key === "\n") {
                if (rowKey !== undefined) {
                    if (expanded.has(rowKey))
                        expanded.delete(rowKey);
                    else
                        expanded.add(rowKey);
                    notice = undefined;
                    return;
                }
                if (!(row === null || row === void 0 ? void 0 : row.item))
                    return;
                copy(fixPrompt(row.item, verifyCmdFor(row.item.doctorId)), "copied finding");
                return;
            }
        },
    });
}
