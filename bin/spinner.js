import { CYAN, DIM, RESET } from "./palette.js";
import { truncateVisible } from "./tty.js";
// The spinner: the one place that owns the "work is happening" line —
// timer-driven, single-line, in-place, synchronized-output like every
// other paint in this package. It exists for the silent gap after Enter:
// while the cohort's children run, the terminal shows a live line instead
// of frozen silence. Headless/piped runs never construct one — the gate
// lives in the command layer, alongside every other TUI decision.
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
// Pure frame: braille glyph cycling with wall-clock elapsed, so the line
// stays alive between doctor completions. The glyph is the only colored
// part; separators are dim like every other chrome in the report.
export function spinnerLine(tick, s) {
    const glyph = CYAN + FRAMES[Math.abs(tick) % FRAMES.length] + RESET;
    const counts = s.total > 0 ? `${DIM}·${RESET} ${s.done} of ${s.total} done ` : "";
    const note = s.note !== undefined ? `${DIM}·${RESET} ${s.note} ` : "";
    return `${glyph} ${s.label} ${counts}${note}${DIM}·${RESET} ${formatMs(s.elapsedMs)}`;
}
export function formatMs(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}
// One line, owned outright: every repaint is carriage-return + clear-line
// + the new frame inside synchronized output, so partial frames never
// show. stop() erases the line and restores the cursor — whatever paints
// next starts from a clean slate.
export function startSpinner(stdout, initial, opts = {}) {
    var _a, _b;
    const delay = (_a = opts.delayMs) !== null && _a !== void 0 ? _a : 80;
    const now = (_b = opts.now) !== null && _b !== void 0 ? _b : Date.now;
    const state = { label: initial.label, done: 0, total: initial.total, elapsedMs: 0 };
    const startedAt = now();
    let tick = 0;
    const paint = () => {
        var _a;
        // Truncated to the terminal like every other paint (tty.ts's frame
        // discipline): an overlong label+note would wrap, and the clear-line
        // repaint would then leave residue on the second row.
        const line = truncateVisible(spinnerLine(tick, state), Math.max(10, ((_a = stdout.columns) !== null && _a !== void 0 ? _a : 120) - 1));
        stdout.write(`\x1b[?2026h\r\x1b[2K${line}\x1b[?2026l`);
    };
    stdout.write("\x1b[?25l");
    paint();
    const timer = setInterval(() => {
        tick += 1;
        state.elapsedMs = now() - startedAt;
        paint();
    }, delay);
    return {
        update(patch) {
            if (patch.done !== undefined)
                state.done = patch.done;
            if (patch.note !== undefined)
                state.note = patch.note;
            state.elapsedMs = now() - startedAt;
            paint();
        },
        stop() {
            clearInterval(timer);
            stdout.write("\r\x1b[2K\x1b[?25h");
        },
    };
}
