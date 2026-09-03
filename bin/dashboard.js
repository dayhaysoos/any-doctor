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
exports.highlightCode = highlightCode;
exports.scoreBar = scoreBar;
exports.buildItems = buildItems;
exports.issuePrompt = issuePrompt;
exports.visibleWidth = visibleWidth;
exports.truncateVisible = truncateVisible;
exports.resolveDashboardLayout = resolveDashboardLayout;
exports.buildListRows = buildListRows;
exports.dashboardFrame = dashboardFrame;
exports.runDashboard = runDashboard;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const clipboard_1 = require("./clipboard");
const score_1 = require("./score");
const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", ORANGE = "\x1b[38;5;208m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";
const GLYPH = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR = { error: RED, warning: ORANGE, info: YELLOW };
const ALT_ENTER = "\x1b[?1049h";
const ALT_EXIT = "\x1b[?1049l";
const SPLIT_MIN_COLS = 100;
const TOKEN_RE = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|if|else|for|while|await|async|try|catch|finally|import|export|from|new|class|extends|throw|typeof|instanceof|in|of|do|switch|case|break|continue|default|yield)\b|\b(\d+(?:\.\d+)?)\b/g;
function highlightCode(line, useColor) {
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
function scoreBar(score, width) {
    const filled = Math.round((score / 100) * width);
    return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}
function buildItems(groups, doctorFile) {
    var _a, _b, _c, _d, _e, _f;
    const items = [];
    for (const g of groups) {
        for (const f of g.findings) {
            const checkId = (_a = f.rule) !== null && _a !== void 0 ? _a : g.meta.id;
            const check = (_b = g.meta.checks) === null || _b === void 0 ? void 0 : _b.find(c => c.id === checkId);
            items.push({
                key: g.meta.id + "/" + checkId + "@" + f.file + ":" + f.line,
                checkKey: g.meta.id + "/" + checkId,
                doctorId: g.meta.id,
                checkId,
                description: (_c = check === null || check === void 0 ? void 0 : check.description) !== null && _c !== void 0 ? _c : g.meta.description,
                severity: (_e = (_d = f.severity) !== null && _d !== void 0 ? _d : check === null || check === void 0 ? void 0 : check.severity) !== null && _e !== void 0 ? _e : g.meta.severity,
                category: (_f = g.meta.category) !== null && _f !== void 0 ? _f : "general",
                site: f,
                impact: check === null || check === void 0 ? void 0 : check.impact,
                why: check === null || check === void 0 ? void 0 : check.why,
                fix: check === null || check === void 0 ? void 0 : check.fix,
                blindSpots: g.meta.blindSpots,
            });
        }
    }
    return items;
}
function issuePrompt(item, verifyCommand) {
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
function visibleWidth(s) {
    return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}
function truncateVisible(s, width) {
    if (visibleWidth(s) <= width)
        return s;
    let out = "";
    let w = 0;
    for (const ch of s.replace(/\x1b\[[0-9;]*m/g, "")) {
        if (w + 1 > width - 1)
            break;
        out += ch;
        w++;
    }
    return out + "…";
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
function resolveDashboardLayout(cols, rows, itemCount) {
    const bodyRows = Math.max(6, rows - 7);
    if (cols >= SPLIT_MIN_COLS) {
        const listWidth = Math.min(56, Math.max(32, Math.floor(cols * 0.44)));
        const detailWidth = cols - listWidth - 2;
        return { mode: "split", listWidth, detailWidth, listHeight: bodyRows, detailHeight: bodyRows };
    }
    const listHeight = Math.min(Math.max(4, Math.ceil(bodyRows * 0.4)), Math.max(1, itemCount));
    return {
        mode: "stacked",
        listWidth: cols,
        detailWidth: cols,
        listHeight,
        detailHeight: Math.max(4, bodyRows - listHeight),
    };
}
function buildListRows(items, useColor, selected, readKeys) {
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
function dashboardFrame(state) {
    var _a, _b, _c, _d;
    const { items, selected, readKeys, root, useColor, cols, rows } = state;
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    const layout = resolveDashboardLayout(cols, rows, items.length);
    const { score, grade } = (0, score_1.scoreFromSeverities)(items.map(it => it.severity));
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
    const viewport = Math.max(3, layout.listHeight);
    let firstVisible = Math.max(0, Math.min(selected - viewport + 1, Math.max(0, rowsData.length - viewport)));
    const visibleRows = rowsData.slice(firstVisible, firstVisible + viewport);
    const listLines = [];
    for (const row of visibleRows) {
        listLines.push(truncateVisible(row.text, layout.listWidth));
    }
    while (listLines.length < viewport)
        listLines.push("");
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
    const body = [];
    if (layout.mode === "split") {
        const bodyRows = Math.max(listLines.length, Math.min(detail.length, layout.detailHeight));
        for (let i = 0; i < bodyRows; i++) {
            body.push(padVisible(truncateVisible((_c = listLines[i]) !== null && _c !== void 0 ? _c : "", layout.listWidth), layout.listWidth) + "  " + ((_d = detail[i]) !== null && _d !== void 0 ? _d : ""));
        }
    }
    else {
        for (const l of listLines)
            body.push(l);
        body.push("");
        body.push(c("─".repeat(Math.max(10, Math.min(cols - 2, 80))), DIM));
        for (const l of detail.slice(0, layout.detailHeight))
            body.push(l);
    }
    const footer = [];
    if (state.notice)
        footer.push(c("✔ " + state.notice, GREEN));
    footer.push(c("↑↓ move · enter copy issue context · q quit", DIM));
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
            const marker = i === line - 1 ? c(">", BOLD) : "  ";
            const num = c(String(i + 1).padStart(4), DIM);
            const text = truncateVisible((_a = all[i]) !== null && _a !== void 0 ? _a : "", Math.max(10, width));
            out.push(`${marker} ${num} │ ${highlightCode(text, useColor)}`);
        }
    }
    catch {
        out.push(c("  (source unavailable)", DIM));
    }
    return out;
}
async function runDashboard(input) {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY || !stdout.isTTY)
        return;
    const useColor = input.useColor;
    const items = buildItems(input.groups, input.doctorFile);
    if (items.length === 0)
        return;
    let selected = 0;
    const readKeys = new Set();
    let notice;
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write(ALT_ENTER);
    const draw = () => {
        const it = items[selected];
        readKeys.add(it.key);
        const frame = dashboardFrame({
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
        stdout.write("\x1b[H" + frame.split("\n").map(l => l + "\x1b[K").join("\n") + "\x1b[J");
    };
    await new Promise((resolve) => {
        draw();
        const onData = (buf) => {
            const s = buf.toString("utf8");
            if (s === "q" || s === "\x03")
                return finish();
            if (s === "\x1b[A" || s === "k") {
                selected = Math.max(0, selected - 1);
                notice = undefined;
                return draw();
            }
            if (s === "\x1b[B" || s === "j") {
                selected = Math.min(items.length - 1, selected + 1);
                notice = undefined;
                return draw();
            }
            if (s === "\r" || s === "\n") {
                const it = items[selected];
                const verifyCommand = `any-doctor run "${input.doctorFile}" "${input.root}"`;
                if ((0, clipboard_1.copyToClipboard)(issuePrompt(it, verifyCommand))) {
                    notice = "copied issue context — paste into your agent";
                }
                else {
                    notice = "clipboard unavailable";
                }
                return draw();
            }
        };
        const finish = () => {
            stdin.removeListener("data", onData);
            stdin.setRawMode(false);
            stdin.pause();
            stdout.write(ALT_EXIT);
            resolve();
        };
        stdin.on("data", onData);
    });
}
