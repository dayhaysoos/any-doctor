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
exports.scoreBar = scoreBar;
exports.buildItems = buildItems;
exports.issuePrompt = issuePrompt;
exports.buildSections = buildSections;
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
                sites: [f],
                impact: check === null || check === void 0 ? void 0 : check.impact,
                why: check === null || check === void 0 ? void 0 : check.why,
                fix: check === null || check === void 0 ? void 0 : check.fix,
                blindSpots: g.meta.blindSpots,
                doctorFile,
            });
        }
    }
    return items;
}
function issuePrompt(item, verifyCommand) {
    const n = item.sites.length;
    const lines = [
        `Fix exactly one any-doctor check:`,
        "",
        `${item.severity.toUpperCase()} · ${item.description} (${item.checkKey}, ×${n})`,
    ];
    if (item.impact)
        lines.push("", "Impact " + item.impact);
    lines.push("", "Affected sites:");
    for (const s of item.sites.slice(0, 50))
        lines.push(`- ${s.file}:${s.line}`);
    if (item.why)
        lines.push("", "Why " + item.why);
    if (item.fix)
        lines.push("", "Suggested fix: " + item.fix);
    lines.push("", "Scope:", `- Fix only ${item.checkKey}.`, "- Fix the root cause; do not suppress, disable, or silence the check.", "- Keep unrelated refactors out of this pass.", "", `Verify with \`${verifyCommand}\` and confirm ${item.key} is gone before moving on.`);
    return lines.join("\n");
}
function buildSections(items) {
    const sections = [];
    const byDoctor = new Map();
    items.forEach((it, i) => {
        if (!byDoctor.has(it.doctorId))
            byDoctor.set(it.doctorId, []);
        byDoctor.get(it.doctorId).push(i);
    });
    for (const [doctorId, indexes] of byDoctor) {
        sections.push({ title: doctorId, itemIndexes: indexes });
    }
    return sections;
}
function dashboardFrame(opts) {
    var _a, _b;
    const { items, selected, readKeys, cols, rows, useColor } = opts;
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    const { score, grade } = (0, score_1.scoreFromSeverities)(items.map(it => it.severity));
    const barWidth = Math.min(46, Math.max(20, cols - 52));
    const gradeColor = score >= 75 ? GREEN : score >= 50 ? YELLOW : RED;
    const bar = useColor ? c(scoreBar(score, barWidth), gradeColor) : scoreBar(score, barWidth);
    const doctorWord = items.length === 1 ? "doctor" : "doctors";
    const header = [
        c(`┌${"─".repeat(9)}┐`, DIM),
        `${c(`│ ${String(score).padEnd(3)} │`, DIM)} ${c(`${score} / 100 ${grade}`, BOLD + gradeColor)}  ${dim2(`· ${items.length} ${doctorWord} · ${opts.fileCount} files · ${opts.durationMs}ms`, useColor)}`,
        `${c(`│ ${gradeGlyph(score)} │`, DIM)} ${bar}`,
        `${c(`└${"─".repeat(9)}┘`, DIM)} ${c("any-doctor", DIM)}`,
    ];
    const sel = items[selected];
    const detailWidth = Math.max(20, cols - 52);
    const detailLines = sel ? wrapDetail(detailFor(sel, opts.root, useColor), detailWidth) : [];
    const left = [];
    left.push(c("Issues by doctor", BOLD));
    left.push("");
    let leftCount = 0;
    const maxList = Math.max(4, rows - 10);
    for (const section of buildSections(items)) {
        if (leftCount >= maxList)
            break;
        left.push(c(section.title, BOLD));
        leftCount++;
        let prevCheckId = null;
        for (const idx of section.itemIndexes) {
            if (leftCount >= maxList)
                break;
            const it = items[idx];
            const cursor = idx === selected ? c("› ", BOLD) : "  ";
            const glyph = c(GLYPH[it.severity], COLOR[it.severity]);
            const isRead = readKeys.has(it.key);
            const site = it.sites[0];
            const rowLabel = prevCheckId === it.checkId
                ? c(`${site.file}:${site.line}`, DIM)
                : c(it.description, isRead ? DIM : "");
            prevCheckId = it.checkId;
            left.push(`${cursor}${glyph} ${rowLabel}${c("  " + site.file + ":" + site.line, DIM)}`);
            leftCount++;
        }
        left.push("");
    }
    const frame = ["\x1b[H\x1b[2J", ...header];
    frame.push("");
    const bodyRows = Math.max(6, rows - header.length - 4);
    for (let i = 0; i < bodyRows; i++) {
        const l = ((_a = left[i]) !== null && _a !== void 0 ? _a : "").padEnd(0);
        const r = (_b = detailLines[i]) !== null && _b !== void 0 ? _b : "";
        frame.push(padTo(l, Math.min(50, Math.floor(cols / 2))) + r);
    }
    frame.push("");
    if (opts.notice)
        frame.push(c("✔ " + opts.notice, GREEN));
    frame.push(c("↑↓ move · enter copy issue context · q quit", DIM));
    return frame.join("\n");
    function dim2(s, on) {
        return on ? DIM + s + RESET : s;
    }
}
function gradeGlyph(score) {
    return score >= 75 ? "▽" : score >= 50 ? "▽" : "x x";
}
function padTo(s, width) {
    const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
    const pad = Math.max(0, width - plain.length);
    return s + " ".repeat(pad);
}
function wrapDetail(lines, width) {
    const out = [];
    for (const l of lines) {
        if (l.length <= width)
            out.push(l);
        else {
            for (let i = 0; i < l.length; i += width)
                out.push(l.slice(i, i + width));
        }
    }
    return out;
}
function detailFor(item, root, useColor) {
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    const site = item.sites[0];
    const lines = [];
    const first = item.sites[0];
    lines.push(c(`${cap(item.category)} · ${item.severity} · ${first.file}:${first.line}`, DIM));
    lines.push("");
    if (item.impact) {
        lines.push(c("  Impact " + item.impact, DIM));
        lines.push("");
    }
    else {
        lines.push(c("  Impact " + item.description, DIM));
        lines.push("");
    }
    if (item.why) {
        lines.push(c("  Why " + item.why, DIM));
        lines.push("");
    }
    const codeLines = codeFrame(root, site.file, site.line, useColor);
    lines.push(...codeLines);
    lines.push("");
    if (item.fix)
        lines.push(c("  Fix " + item.fix, DIM));
    return lines;
}
function codeFrame(root, file, line, useColor) {
    const out = [];
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    try {
        const all = fs.readFileSync(path.resolve(root, file), "utf8").split("\n");
        const from = Math.max(0, line - 3);
        const to = Math.min(all.length, line + 2);
        for (let i = from; i < to; i++) {
            const marker = i === line - 1 ? "> " : "  ";
            out.push(`${c(String(i + 1).padStart(5), DIM)} │ ${marker}${all[i]}`);
        }
    }
    catch {
        out.push(c("  (source unavailable)", DIM));
    }
    return out;
}
function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
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
    const sections = buildSections(items);
    let selected = 0;
    const readKeys = new Set();
    let notice;
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write(ALT_ENTER);
    const draw = () => {
        const it = items[selected];
        readKeys.add(it.key);
        stdout.write(dashboardFrame({
            items,
            sections,
            selected,
            readKeys,
            query: "",
            cols: stdout.columns || 120,
            rows: stdout.rows || 34,
            root: input.root,
            fileCount: input.fileCount,
            durationMs: input.durationMs,
            useColor,
            notice,
        }));
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
                const verifyCommand = `node "${path.resolve(__dirname, "cli.js")}" run "${input.doctorFile}" "${input.root}"`;
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
