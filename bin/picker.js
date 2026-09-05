import { fuzzyFilter } from "./fuzzy.js";
import { canRunTui, runTty } from "./tty.js";
const GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";
const GLYPH = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR = { error: GREEN, warning: YELLOW, info: CYAN };
export function pickerFrame(title, items, selected, query, useColor, notice) {
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
export function filterPickerItems(items, query) {
    return fuzzyFilter(items, it => { var _a; return `${it.id} ${it.label} ${(_a = it.sub) !== null && _a !== void 0 ? _a : ""}`; }, query);
}
export function isPrintable(s) {
    return s.length === 1 && s >= " " && s !== "\x7f";
}
export async function pickItemOn(stdin, stdout, items, useColor, title = "Select an option", notice) {
    if (items.length === 0 || !canRunTui(stdin, stdout))
        return null;
    let query = "";
    let selected = 0;
    const filtered = () => filterPickerItems(items, query);
    const frame = () => {
        const list = filtered();
        if (selected >= list.length)
            selected = Math.max(0, list.length - 1);
        return pickerFrame(title, list, selected, query, useColor, notice);
    };
    return runTty({
        stdin,
        stdout,
        frame,
        onKey: (key, finish) => {
            if (key === "\x03" || key === "esc")
                return finish(null);
            if (key === "\x7f" || key === "\b") {
                query = query.slice(0, -1);
                selected = 0;
                return;
            }
            if (key === "up" || key === "k") {
                selected = Math.max(0, selected - 1);
                return;
            }
            if (key === "down" || key === "j") {
                selected = Math.min(filtered().length - 1, selected + 1);
                return;
            }
            if (key === "\r" || key === "\n") {
                const list = filtered();
                if (list.length > 0)
                    finish(list[Math.min(selected, list.length - 1)]);
                return;
            }
            if (isPrintable(key)) {
                query += key;
                selected = 0;
                return;
            }
        },
    });
}
export function pickItem(items, useColor, title = "Select an option", notice) {
    return pickItemOn(process.stdin, process.stdout, items, useColor, title, notice);
}
