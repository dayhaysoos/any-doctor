import { createKeyFeed } from "./keys.js";
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
// In-place repaint: home the cursor and rewrite every line with a
// clear-to-end-of-line so shorter content cannot leave ghosts, then clear
// below the frame. A full-screen \x1b[2J erase on every keypress leaves a
// blank window while the frame streams back in, which reads as flicker; the
// erase runs only on the first paint.
export function paintFrame(stdout, frame, cols, first) {
    const width = Math.max(10, cols - 1);
    const lines = frame.split("\n").map(l => truncateVisible(l, width) + "\x1b[K");
    stdout.write((first ? "\x1b[H\x1b[2J" : "\x1b[H") + lines.join("\n") + "\x1b[J");
}
export function runTty(options) {
    const { stdin, stdout, frame, onKey } = options;
    return new Promise((resolve) => {
        const wasRaw = stdin.isRaw;
        stdin.setRawMode(true);
        stdin.resume();
        stdout.write("\x1b[?25l");
        let firstPaint = true;
        const repaint = () => {
            paintFrame(stdout, frame(), stdout.columns || 120, firstPaint);
            firstPaint = false;
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
        repaint();
        stdin.on("data", feed);
    });
}
