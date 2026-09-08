import { fuzzyFilter } from "./fuzzy.js";
import { BOLD, colorizer, DIM, GLYPH, GREEN, SEVERITY_COLOR } from "./palette.js";
import { canRunTui, runTty } from "./tty.js";
export function pickerFrame(title, items, selected, query, useColor, notice, chosen) {
    const c = colorizer(useColor);
    const multi = chosen !== undefined;
    const hint = multi
        ? "  (type to filter · ↑↓ move · space select · a all · enter run · esc cancel)"
        : "  (type to filter · ↑↓ move · enter select · esc cancel)";
    const lines = [];
    lines.push(c(title, BOLD) + c(hint, DIM));
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
            const glyph = it.severity ? c(GLYPH[it.severity] + " ", SEVERITY_COLOR[it.severity]) : "";
            const box = multi ? c(chosen.has(it.id) ? "[x] " : "[ ] ", chosen.has(it.id) ? GREEN : DIM) : "";
            const row = `${glyph}${box}${it.label}${it.sub ? c("  " + it.sub, DIM) : ""}`;
            lines.push(i === selected ? c("❯ " + row, BOLD) : "  " + row);
        }
        if (items.length > cap)
            lines.push(c(`  … +${items.length - cap} more`, DIM));
        if (multi)
            lines.push(c(`${chosen.size} of ${items.length} selected · enter runs the selection`, DIM));
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
// The cohort selector: selection is opt-in — nothing is pre-selected, so
// narrowing to one doctor is one space, not nine deselects. Space toggles
// the row under the cursor, `a` toggles every row the filter shows (the
// run-everything gesture), and an empty selection refuses to run (notice,
// stay). All toggling operates on the FILTERED rows.
export async function pickItemsOn(env, items, useColor, title = "Select doctors to run") {
    if (items.length === 0 || !canRunTui(env))
        return null;
    const chosen = new Set();
    let query = "";
    let selected = 0;
    let notice;
    const filtered = () => filterPickerItems(items, query);
    const frame = () => {
        const list = filtered();
        if (selected >= list.length)
            selected = Math.max(0, list.length - 1);
        return pickerFrame(title, list, selected, query, useColor, notice, chosen);
    };
    return runTty({
        stdin: env.stdin,
        stdout: env.stdout,
        frame,
        onKey: (key, finish) => {
            notice = undefined;
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
            if (key === " ") {
                const it = filtered()[Math.min(selected, filtered().length - 1)];
                if (it) {
                    if (chosen.has(it.id))
                        chosen.delete(it.id);
                    else
                        chosen.add(it.id);
                }
                return;
            }
            if (key === "a") {
                const list = filtered();
                const every = list.every(it => chosen.has(it.id));
                for (const it of list) {
                    if (every)
                        chosen.delete(it.id);
                    else
                        chosen.add(it.id);
                }
                return;
            }
            if (key === "\r" || key === "\n") {
                if (chosen.size === 0) {
                    notice = "nothing selected — space to select, a for all, or esc to cancel";
                    return;
                }
                finish(items.filter(it => chosen.has(it.id)));
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
export async function pickItemOn(env, items, useColor, title = "Select an option", notice) {
    if (items.length === 0 || !canRunTui(env))
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
        stdin: env.stdin,
        stdout: env.stdout,
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
