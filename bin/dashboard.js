import * as fs from "fs";
import * as path from "path";
import { copyToClipboard } from "./clipboard.js";
import { resolveFinding } from "./contract.js";
import { scoreFromSeverities } from "./score.js";
import { runTty, truncateVisible, visibleWidth } from "./tty.js";
export { truncateVisible, visibleWidth };
const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", ORANGE = "\x1b[38;5;208m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";
const GLYPH = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR = { error: RED, warning: ORANGE, info: YELLOW };
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
            items.push({
                key: j.checkKey + "@" + f.file + ":" + f.line,
                checkKey: j.checkKey,
                doctorId: j.doctorId,
                checkId: j.checkId,
                description: j.description,
                severity: j.severity,
                category: j.category,
                site: f,
                impact: j.impact,
                why: j.why,
                fix: j.fix,
                blindSpots: j.blindSpots,
            });
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
export function buildListRows(items, useColor, selected, readKeys) {
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    const rows = [];
    let currentDoctor = null;
    let currentCheck = null;
    items.forEach((it, index) => {
        if (it.doctorId !== currentDoctor) {
            currentDoctor = it.doctorId;
            currentCheck = null;
            rows.push({ kind: "section", text: c(it.doctorId, BOLD), severity: it.severity, itemIndex: index });
        }
        const isSelected = index === selected;
        const isRead = readKeys.has(it.key);
        const glyph = c(GLYPH[it.severity], COLOR[it.severity]);
        const wrap = isSelected ? BOLD : isRead ? DIM : undefined;
        const row = {
            kind: "item",
            text: `${isSelected ? c("›", BOLD) : " "}${glyph} ${c(it.site.file + ":" + it.site.line, wrap)}${it.checkId !== it.doctorId ? c("  " + it.checkId, DIM) : ""}`,
            severity: it.severity,
            itemIndex: index,
        };
        rows.push(row);
        void currentCheck;
    });
    return rows;
}
export function dashboardFrame(state) {
    var _a, _b, _c, _d, _e;
    const { items, selected, readKeys, root, useColor, cols, rows } = state;
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    const layout = resolveDashboardLayout(cols, rows, items.length);
    const { score, grade } = scoreFromSeverities(items.map(it => it.severity));
    const gradeColor = score >= 75 ? GREEN : score >= 50 ? YELLOW : RED;
    const barWidth = Math.min(46, Math.max(16, cols - 60));
    const header = [
        c(`Score: ${score} / 100 — ${grade}`, BOLD + gradeColor),
        c(scoreBar(score, barWidth), gradeColor),
        c(`${items.length} finding${items.length === 1 ? "" : "s"} · ${input0(state.fileCount)}`, DIM),
        "",
    ];
    function input0(n) {
        return n + " files · " + state.durationMs + "ms";
    }
    const rowsData = buildListRows(items, useColor, selected, readKeys);
    const viewport = Math.max(1, Math.min(layout.listHeight, layout.bodyRows));
    let firstVisible = Math.max(0, Math.min(selected - viewport + 1, Math.max(0, rowsData.length - viewport)));
    const visibleRows = rowsData.slice(firstVisible, firstVisible + viewport);
    const listLines = [];
    for (const row of visibleRows) {
        listLines.push(truncateVisible(row.text, layout.listWidth));
    }
    while (listLines.length < viewport)
        listLines.push("");
    const sel = items[selected];
    const detail = [];
    if (sel) {
        detail.push(c(`${sel.site.file}:${sel.site.line}`, BOLD));
        detail.push(c(`${cap(sel.category)} · ${sel.severity}`, DIM));
        detail.push("");
        const impact = (_a = sel.impact) !== null && _a !== void 0 ? _a : sel.description;
        for (const l of wordWrap(impact, layout.detailWidth - 2))
            detail.push(c(l, sel.severity === "error" ? RED : sel.severity === "warning" ? ORANGE : CYAN));
        detail.push("");
        detail.push(c("Why", DIM));
        for (const l of wordWrap((_b = sel.why) !== null && _b !== void 0 ? _b : "Not documented for this check.", layout.detailWidth - 2))
            detail.push("  " + l);
        detail.push("");
        detail.push(c("Code", DIM));
        for (const l of codeFrame(root, sel.site.file, sel.site.line, layout.detailWidth - 2, useColor))
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
        c("↑↓ move · enter copy issue context · q quit", DIM),
    ];
    return [...header, "", ...body, "", ...footer].join("\n");
}
function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function codeFrame(root, file, line, width, useColor) {
    var _a;
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    const out = [];
    try {
        const all = fs.readFileSync(path.resolve(root, file), "utf8").split("\n");
        const from = Math.max(0, line - 3);
        const to = Math.min(all.length, line + 2);
        for (let i = from; i < to; i++) {
            const marker = i === line - 1 ? c(">  ", BOLD) : "   ";
            const num = c(String(i + 1).padStart(3), DIM);
            const text = truncateVisible((_a = all[i]) !== null && _a !== void 0 ? _a : "", Math.max(10, width));
            out.push(`${marker} ${num} │ ${highlightCode(text, useColor)}`);
        }
    }
    catch {
        out.push(c("  (source unavailable)", DIM));
    }
    return out;
}
export async function runDashboard(input) {
    await runDashboardOn(process.stdin, process.stdout, input);
}
export async function runDashboardOn(stdin, stdout, input, deps = {}) {
    if (!stdin.isTTY || !stdout.isTTY)
        return;
    const useColor = input.useColor;
    const items = buildItems(input.groups);
    let selected = 0;
    const readKeys = new Set();
    let notice;
    const frame = () => {
        try {
            const it = items[selected];
            if (it)
                readKeys.add(it.key);
            return dashboardFrame({
                items,
                selected,
                readKeys,
                root: input.root,
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
    await runTty({
        stdin,
        stdout,
        frame,
        onKey: (key, finish) => {
            var _a;
            if (key === "q" || key === "\x03" || key === "esc")
                return finish();
            if (key === "ignore")
                return;
            if (key === "up" || key === "k") {
                selected = Math.max(0, selected - 1);
                notice = undefined;
                return;
            }
            if (key === "down" || key === "j") {
                selected = Math.min(items.length - 1, selected + 1);
                notice = undefined;
                return;
            }
            if (key === "\r" || key === "\n") {
                const it = items[selected];
                if (!it)
                    return;
                const verifyCommand = `any-doctor run "${input.doctorFile}" "${input.root}"`;
                notice = ((_a = deps.copy) !== null && _a !== void 0 ? _a : copyToClipboard)(issuePrompt(it, verifyCommand))
                    ? "copied issue context — paste into your agent"
                    : "clipboard unavailable";
                return;
            }
        },
    });
}
