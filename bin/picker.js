"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickerFrame = pickerFrame;
exports.filterPickerItems = filterPickerItems;
exports.isPrintable = isPrintable;
exports.pickItem = pickItem;
const fuzzy_1 = require("./fuzzy");
const screen_1 = require("./screen");
const keys_1 = require("./keys");
const GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";
const GLYPH = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR = { error: GREEN, warning: YELLOW, info: CYAN };
function pickerFrame(title, items, selected, query, useColor, notice) {
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    const lines = [];
    lines.push(c(title, BOLD) + c("  (type to filter · ↑↓ move · enter select · esc cancel)", DIM));
    lines.push("");
    lines.push(c("❯ " + query, BOLD) + c("▏", DIM));
    lines.push("");
    if (items.length === 0) {
        lines.push(c("  no matching doctors", DIM));
    }
    else {
        const cap = Math.min(items.length, 12);
        for (let i = 0; i < cap; i++) {
            const it = items[i];
            const glyph = it.severity ? c(GLYPH[it.severity] + " ", COLOR[it.severity]) : "";
            const row = `${glyph}${it.label}${it.sub ? c("  " + it.sub, DIM) : ""}`;
            lines.push(i === selected ? c("❯ " + row, BOLD) : "  " + row);
        }
        if (items.length > cap)
            lines.push(c(`  … +${items.length - cap} more`, DIM));
    }
    if (notice) {
        lines.push("");
        lines.push(c("✔ " + notice, GREEN));
    }
    return lines.join("\n");
}
function filterPickerItems(items, query) {
    return (0, fuzzy_1.fuzzyFilter)(items, it => { var _a; return `${it.id} ${it.label} ${(_a = it.sub) !== null && _a !== void 0 ? _a : ""}`; }, query);
}
function isPrintable(s) {
    return s.length === 1 && s >= " " && s !== "\x7f";
}
async function pickItem(items, useColor, title = "Select an option", notice) {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY || !stdout.isTTY || items.length === 0)
        return null;
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    let query = "";
    let selected = 0;
    const filtered = () => filterPickerItems(items, query);
    const screen = new screen_1.Screen(stdout);
    const draw = () => {
        const list = filtered();
        if (selected >= list.length)
            selected = Math.max(0, list.length - 1);
        screen.render(pickerFrame(title, list, selected, query, useColor, notice).split("\n"));
    };
    return new Promise((resolve) => {
        const wasRaw = stdin.isRaw;
        stdin.setRawMode(true);
        stdin.resume();
        stdout.write("\x1b[?25l");
        draw();
        const cleanup = (result) => {
            stdin.removeListener("data", feed);
            if (wasRaw !== undefined)
                stdin.setRawMode(wasRaw);
            stdin.pause();
            stdout.write("\x1b[?25h");
            screen.exit();
            resolve(result);
        };
        const onKey = (key) => {
            const s = key;
            if (s === "\x03" || s === "esc")
                return cleanup(null);
            if (key === "\x7f" || key === "\b") {
                query = query.slice(0, -1);
                selected = 0;
                return draw();
            }
            if (key === "up" || key === "k") {
                selected = Math.max(0, selected - 1);
                return draw();
            }
            if (key === "down" || key === "j") {
                selected = Math.min(filtered().length - 1, selected + 1);
                return draw();
            }
            if (key === "\r" || key === "\n") {
                const list = filtered();
                if (list.length === 0)
                    return;
                return cleanup(list[Math.min(selected, list.length - 1)]);
            }
            if (isPrintable(key)) {
                query += key;
                selected = 0;
                return draw();
            }
        };
        const feed = (0, keys_1.createKeyFeed)(onKey);
        stdin.on("data", feed);
    });
}
