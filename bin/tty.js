import { createKeyFeed } from "./keys.js";
// "Is this a real terminal" — the shared floor of every TUI decision.
// Deliberately excludes headless env vars and width heuristics: those are
// report-vs-dashboard policy and belong to the command layer.
export function canRunTui(env) {
    return Boolean(env.stdin.isTTY && env.stdout.isTTY);
}
export function visibleWidth(s) {
    return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}
export function truncateVisible(s, width) {
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
// In-place repaint, always: home the cursor and rewrite every line with a
// clear-to-end-of-line, then clear below the frame. Per-line \x1b[K plus
// the trailing \x1b[J fully own the screen, so no full-screen \x1b[2J
// erase is ever needed — including on the first paint, where the erase
// showed as a one-time blank flash while the frame streamed in. The payload
// is wrapped in DECSET 2026 (synchronized output): terminals that support
// it hold the repaint until the frame is fully transmitted, so they never
// paint a half-frame; terminals that don't simply ignore the mode.
export function paintFrame(stdout, frame, cols) {
    const width = Math.max(10, cols - 1);
    const lines = frame.split("\n").map(l => truncateVisible(l, width) + "\x1b[K");
    stdout.write("\x1b[?2026h\x1b[H" + lines.join("\n") + "\x1b[J\x1b[?2026l");
}
export function runTty(options) {
    const { stdin, stdout, frame, onKey } = options;
    return new Promise((resolve) => {
        const wasRaw = stdin.isRaw;
        stdin.setRawMode(true);
        stdin.resume();
        stdout.write("\x1b[?25l");
        let lastFrame;
        const repaint = () => {
            const f = frame();
            if (f === lastFrame)
                return; // identical frame: not one byte of churn
            lastFrame = f;
            paintFrame(stdout, f, stdout.columns || 120);
        };
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            stdin.removeListener("data", feed);
            if (wasRaw !== undefined)
                stdin.setRawMode(wasRaw);
            stdin.pause();
            stdout.write("\x1b[?25h");
            resolve(result);
        };
        const guarded = (key) => {
            try {
                onKey(key, finish);
                if (!settled)
                    repaint();
            }
            catch (e) {
                process.stderr.write("key handling error: " + String(e));
            }
        };
        const feed = createKeyFeed(guarded);
        // The first paint gets the same armor as every repaint: a throwing
        // frame builder degrades to a blank-but-alive session (keys still work,
        // finish still restores the tty) instead of a hung promise and a leaked
        // raw mode.
        try {
            repaint();
        }
        catch (e) {
            process.stderr.write("initial paint failed: " + String(e) + "\n");
        }
        stdin.on("data", feed);
    });
}
