import * as fs from "fs";
import * as path from "path";
import { copyToClipboard } from "./clipboard.js";
import { resolveFinding, runCommandFor } from "./contract.js";
import { scoreFromSeverities } from "./score.js";
import { processTtyEnv } from "./tty.js";
import * as tty from "./tty.js";
import { runTty, truncateVisible, visibleWidth } from "./tty.js";
export { truncateVisible, visibleWidth };
import { BOLD, colorizer, DIM, GLYPH, gradeColor, GREEN, ORANGE, RESET, SEVERITY_COLOR } from "./palette.js";
const SPLIT_MIN_COLS = 100;
const TOKEN_RE = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|if|else|for|while|await|async|try|catch|finally|import|export|from|new|class|extends|throw|typeof|instanceof|in|of|do|switch|case|break|continue|default|yield)\b|\b(\d+(?:\.\d+)?)\b/g;
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
            items.push({ ...j, key: j.checkKey + "@" + f.file + ":" + f.line, site: f });
        }
    }
    return items;
}
export function issuePrompt(item, verifyCommand) {
    const site = item.site;
    const lines = [
        "Fix exactly one any-doctor check:",
        "",
        `${item.severity.toUpperCase()} · ${item.description} (${item.checkKey})`,
        "",
        `Affected site: ${site.file}:${site.line}`,
    ];
    if (item.impact)
        lines.push("", "Impact " + item.impact);
    if (item.why)
        lines.push("", "Why " + item.why);
    if (item.fix)
        lines.push("", "Suggested fix: " + item.fix);
    lines.push("", "Scope:", `- Fix only ${item.checkKey} at this site.`, "- Fix the root cause; do not suppress, disable, or silence the check.", "- Keep unrelated refactors out of this pass.", "", `Verify with \`${verifyCommand}\` and confirm the finding is gone before moving on.`);
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
// The re-scan loop is the pagination: a check shows its first N instances,
// then an affordance to fix a few and run again.
export const INSTANCES_PER_CHECK = 50;
const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };
function groupByDoctor(items) {
    var _a;
    const doctors = [];
    const byDoctor = new Map();
    for (const it of items) {
        let checks = byDoctor.get(it.doctorId);
        if (!checks) {
            checks = new Map();
            byDoctor.set(it.doctorId, checks);
            doctors.push({ doctorId: it.doctorId, checks: [], multiCheck: false });
        }
        const group = (_a = checks.get(it.checkKey)) !== null && _a !== void 0 ? _a : [];
        group.push(it);
        checks.set(it.checkKey, group);
    }
    for (const d of doctors) {
        const entries = [...byDoctor.get(d.doctorId).entries()].map(([checkKey, list]) => ({
            checkKey,
            items: [...list].sort((a, b) => a.site.file === b.site.file
                ? a.site.line - b.site.line
                : a.site.file < b.site.file ? -1 : 1),
        }));
        d.checks = entries.sort((a, b) => {
            const sa = SEVERITY_RANK[a.items[0].declaredSeverity];
            const sb = SEVERITY_RANK[b.items[0].declaredSeverity];
            return sa !== sb ? sa - sb : b.items.length - a.items.length || (a.checkKey < b.checkKey ? -1 : 1);
        });
        d.multiCheck = entries.length > 1;
    }
    return doctors;
}
function summarize(checkKey, groupItems) {
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
// Error-severity checks open on entry; everything else starts collapsed.
export function initialExpanded(items) {
    const expanded = new Set();
    for (const d of groupByDoctor(items)) {
        if (!d.multiCheck)
            continue;
        for (const g of d.checks) {
            if (g.items[0].declaredSeverity === "error")
                expanded.add(g.checkKey);
        }
    }
    return expanded;
}
export function buildListRows(items, useColor, selectedRow, readKeys, expanded) {
    var _a, _b;
    const c = colorizer(useColor);
    const open = expanded !== null && expanded !== void 0 ? expanded : new Set();
    const indexOfItem = new Map(items.map((it, i) => [it, i]));
    const rows = [];
    for (const d of groupByDoctor(items)) {
        rows.push({
            kind: "section",
            text: c(d.doctorId, BOLD),
            severity: (_b = (_a = d.checks[0]) === null || _a === void 0 ? void 0 : _a.items[0].severity) !== null && _b !== void 0 ? _b : "info",
            selectable: false,
            itemIndex: -1,
        });
        if (!d.multiCheck) {
            // Flat rendering, byte-identical to the single-doctor era.
            for (const it of d.checks[0].items) {
                const rowIndex = rows.length;
                rows.push({
                    kind: "item",
                    text: itemRowText(it, selectedRow === rowIndex, readKeys, c),
                    severity: it.severity,
                    selectable: true,
                    itemIndex: indexOfItem.get(it),
                });
            }
            continue;
        }
        for (const g of d.checks) {
            const summary = summarize(g.checkKey, g.items);
            const checkRowIndex = rows.length;
            const isOpen = open.has(g.checkKey);
            rows.push({
                kind: "check",
                text: checkRowText(summary, isOpen, selectedRow === checkRowIndex, c),
                severity: summary.severity,
                selectable: true,
                itemIndex: -1,
                check: summary,
            });
            if (!isOpen)
                continue;
            const shown = g.items.slice(0, INSTANCES_PER_CHECK);
            for (const it of shown) {
                const rowIndex = rows.length;
                rows.push({
                    kind: "item",
                    text: "  " + itemRowText(it, selectedRow === rowIndex, readKeys, c, true),
                    severity: it.severity,
                    selectable: true,
                    itemIndex: indexOfItem.get(it),
                });
            }
            if (g.items.length > shown.length) {
                const moreRowIndex = rows.length;
                rows.push({
                    kind: "more",
                    text: `  ${selectedRow === moreRowIndex ? c("›", BOLD) + " " : ""}${c("… and " + (g.items.length - shown.length) + " more — fix a few and re-scan", DIM)}`,
                    severity: summary.severity,
                    selectable: true,
                    itemIndex: -1,
                    check: summary,
                });
            }
        }
    }
    return rows;
}
function itemRowText(it, isSelected, readKeys, c, nested = false) {
    const isRead = readKeys.has(it.key);
    const glyph = c(GLYPH[it.severity], SEVERITY_COLOR[it.severity]);
    const wrap = isSelected ? BOLD : isRead ? DIM : undefined;
    const suffix = nested || it.checkId === it.doctorId ? "" : c("  " + it.checkId, DIM);
    return `${isSelected ? c("›", BOLD) : " "}${glyph} ${c(it.site.file + ":" + it.site.line, wrap)}${suffix}`;
}
function checkRowText(summary, isOpen, isSelected, c) {
    const arrow = isOpen ? "▾" : "▸";
    return `${isSelected ? c("›", BOLD) : " "}${c(arrow, DIM)} ${c(GLYPH[summary.severity], SEVERITY_COLOR[summary.severity])} ${c(summary.description, isSelected ? BOLD : undefined)} ${c("×" + summary.count, DIM)}`;
}
export function dashboardFrame(state) {
    var _a, _b, _c, _d, _e;
    const { items, selected, readKeys, useColor, cols, rows } = state;
    const c = colorizer(useColor);
    const layout = resolveDashboardLayout(cols, rows, items.length);
    const { score, grade } = scoreFromSeverities(items.map(it => it.severity));
    const barWidth = Math.min(46, Math.max(16, cols - 60));
    const header = [
        c(`Score: ${score} / 100 — ${grade}`, BOLD + gradeColor(score)),
        c(scoreBar(score, barWidth), gradeColor(score)),
        c(`${items.length} finding${items.length === 1 ? "" : "s"} · ${scanSummary(state.fileCount)}`, DIM),
        "",
    ];
    function scanSummary(n) {
        return n + " files · " + state.durationMs + "ms";
    }
    const rowsData = buildListRows(items, useColor, selected, readKeys, state.expanded);
    const viewport = Math.max(1, Math.min(layout.listHeight, layout.bodyRows));
    let firstVisible = Math.max(0, Math.min(selected - viewport + 1, Math.max(0, rowsData.length - viewport)));
    if (selected >= 0 && selected < firstVisible)
        firstVisible = selected;
    const visibleRows = rowsData.slice(firstVisible, firstVisible + viewport);
    const listLines = [];
    for (const row of visibleRows) {
        listLines.push(truncateVisible(row.text, layout.listWidth));
    }
    while (listLines.length < viewport)
        listLines.push("");
    const detail = [];
    const selRow = rowsData[selected];
    if (selRow && selRow.kind === "item" && selRow.itemIndex >= 0) {
        const sel = items[selRow.itemIndex];
        detail.push(c(`${sel.site.file}:${sel.site.line}`, BOLD));
        detail.push(c(`${cap(sel.category)} · ${sel.severity}`, DIM));
        detail.push("");
        const impact = (_a = sel.impact) !== null && _a !== void 0 ? _a : sel.description;
        for (const l of wordWrap(impact, layout.detailWidth - 2))
            detail.push(c(l, SEVERITY_COLOR[sel.severity]));
        detail.push("");
        detail.push(c("Why", DIM));
        for (const l of wordWrap((_b = sel.why) !== null && _b !== void 0 ? _b : "Not documented for this check.", layout.detailWidth - 2))
            detail.push("  " + l);
        detail.push("");
        detail.push(c("Code", DIM));
        for (const l of codeFrameLines(state.readSource(sel.site.file), sel.site.line, layout.detailWidth - 2, useColor))
            detail.push("  " + l);
        detail.push("");
        if (sel.fix) {
            detail.push(c("Fix", DIM));
            for (const l of wordWrap(sel.fix, layout.detailWidth - 2))
                detail.push("  " + l);
        }
        if (sel.blindSpots && sel.blindSpots.length > 0) {
            for (const l of wordWrap("blind spots: " + sel.blindSpots.join("; "), layout.detailWidth - 2)) {
                detail.push(c("  " + l, DIM));
            }
        }
    }
    else if (selRow && selRow.check) {
        // A check row (or its "… and N more" affordance) tells the check's
        // story: what it catches, why it matters, how to fix it, and the
        // blast radius.
        const s = selRow.check;
        detail.push(c(s.checkKey, BOLD));
        detail.push(c(`${s.count} instance${s.count === 1 ? "" : "s"} across ${s.files} file${s.files === 1 ? "" : "s"} · ${s.severity}`, DIM));
        detail.push("");
        for (const l of wordWrap(s.description, layout.detailWidth - 2))
            detail.push(c(l, SEVERITY_COLOR[s.severity]));
        if (s.impact) {
            detail.push("");
            detail.push(c("Impact", DIM));
            for (const l of wordWrap(s.impact, layout.detailWidth - 2))
                detail.push("  " + l);
        }
        if (s.why) {
            detail.push("");
            detail.push(c("Why", DIM));
            for (const l of wordWrap(s.why, layout.detailWidth - 2))
                detail.push("  " + l);
        }
        if (s.fix) {
            detail.push("");
            detail.push(c("Fix", DIM));
            for (const l of wordWrap(s.fix, layout.detailWidth - 2))
                detail.push("  " + l);
        }
        if (s.blindSpots && s.blindSpots.length > 0) {
            detail.push("");
            for (const l of wordWrap("blind spots: " + s.blindSpots.join("; "), layout.detailWidth - 2)) {
                detail.push(c("  " + l, DIM));
            }
        }
    }
    // The body always renders exactly layout.bodyRows lines so the frame
    // height is constant (rows - 1) in every state.
    const body = [];
    if (layout.mode === "split") {
        for (let i = 0; i < layout.bodyRows; i++) {
            body.push(padVisible(truncateVisible((_c = listLines[i]) !== null && _c !== void 0 ? _c : "", layout.listWidth), layout.listWidth) + "  " + ((_d = detail[i]) !== null && _d !== void 0 ? _d : ""));
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
            body.push((_e = stacked[i]) !== null && _e !== void 0 ? _e : "");
    }
    // Fixed-shape footer: the notice line is always present (blank when idle)
    // so showing or clearing a notice never changes the frame height.
    const footer = [
        state.notice ? c("✔ " + state.notice, GREEN) : "",
        c("↑↓ move · →← expand · enter copy issue context · q quit", DIM),
    ];
    return [...header, "", ...body, "", ...footer].join("\n");
}
function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
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
    const items = buildItems(input.groups);
    const expanded = initialExpanded(items);
    const readKeys = new Set();
    let notice;
    const currentRows = () => buildListRows(items, useColor, selectedRow, readKeys, expanded);
    let selectedRow = (() => {
        const rows = buildListRows(items, useColor, 0, new Set(), expanded);
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
            lines = fs.readFileSync(path.resolve(input.root, file), "utf8").split("\n");
        }
        catch {
            lines = null;
        }
        sourceCache.set(file, lines);
        return lines;
    };
    const frame = () => {
        try {
            const rows = currentRows();
            const selRow = rows[selectedRow];
            if (selRow && selRow.kind === "item" && selRow.itemIndex >= 0) {
                readKeys.add(items[selRow.itemIndex].key);
            }
            return dashboardFrame({
                items,
                selected: selectedRow,
                readKeys,
                readSource,
                expanded,
                fileCount: input.fileCount,
                durationMs: input.durationMs,
                useColor,
                notice,
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
            var _a, _b;
            if (key === "q" || key === "\x03" || key === "esc")
                return finish();
            if (key === "ignore")
                return;
            if (key === "up" || key === "k")
                return step(-1);
            if (key === "down" || key === "j")
                return step(1);
            const row = currentRows()[selectedRow];
            if (key === "right" || key === "left") {
                if (!(row === null || row === void 0 ? void 0 : row.check))
                    return;
                if (key === "right")
                    expanded.add(row.check.checkKey);
                else
                    expanded.delete(row.check.checkKey);
                notice = undefined;
                return;
            }
            if (key === "\r" || key === "\n") {
                if ((row === null || row === void 0 ? void 0 : row.kind) === "check" && row.check) {
                    if (expanded.has(row.check.checkKey))
                        expanded.delete(row.check.checkKey);
                    else
                        expanded.add(row.check.checkKey);
                    notice = undefined;
                    return;
                }
                if ((row === null || row === void 0 ? void 0 : row.kind) !== "item" || row.itemIndex < 0)
                    return;
                const it = items[row.itemIndex];
                const verifyCommand = (_a = input.verifyCommand) !== null && _a !== void 0 ? _a : runCommandFor(input.doctorFile, input.root);
                notice = ((_b = deps.copy) !== null && _b !== void 0 ? _b : copyToClipboard)(issuePrompt(it, verifyCommand))
                    ? "copied issue context — paste into your agent"
                    : "clipboard unavailable";
                return;
            }
        },
    });
}
