import { eastAsianWidth } from "get-east-asian-width";
import { stripVTControlCharacters } from "node:util";
import { createKeyFeed } from "./keys.js";
// The one adapter from Node's process stdio to the tty seam.
export function processTtyEnv() {
    return {
        stdin: process.stdin,
        stdout: process.stdout,
    };
}
// "Is this a real terminal" — the shared floor of every TUI decision.
// Deliberately excludes headless env vars and width heuristics: those are
// report-vs-dashboard policy and belong to the command layer.
export function canRunTui(env) {
    return Boolean(env.stdin.isTTY && env.stdout.isTTY);
}
// Conventional terminal cells: East Asian wide/fullwidth and emoji clusters
// occupy two cells; ambiguous characters occupy one. Grapheme boundaries come
// from the runtime's ICU. get-east-asian-width supplies the Unicode width table.
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
// Content is one inert line. Preserve SGR styling, remove other VT commands,
// cursor-moving C0/C1 controls, line separators and bidi layout controls. This
// also removes stray ESC bytes from malformed sequences. Paint commands belong
// to paintFrame, never to doctor-controlled text.
function safeLine(s) {
    return s.split(/(\x1b\[[0-9;:]*m)/g).map((part, i) => i % 2 ? part
        : stripVTControlCharacters(part).replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, "")).join("");
}
function clusterWidth(cluster) {
    const base = [...cluster].find(ch => !/[\p{Mark}\p{Default_Ignorable_Code_Point}]/u.test(ch));
    if (base === undefined)
        return 0;
    // Text-default symbols stay text-width unless a complete emoji presentation
    // or joined pictograph sequence requests two cells. A trailing ZWJ and a
    // standalone enclosing-keycap mark add no width by themselves.
    if (/\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u.test(cluster)
        || /^[#*0-9]\uFE0F?\u20E3$/u.test(cluster)
        || /\p{Extended_Pictographic}\uFE0F?\u200d\p{Extended_Pictographic}/u.test(cluster))
        return 2;
    return eastAsianWidth(base.codePointAt(0), { ambiguousAsWide: false });
}
export function visibleWidth(s) {
    let width = 0;
    for (const { segment } of graphemes.segment(stripVTControlCharacters(safeLine(s))))
        width += clusterWidth(segment);
    return width;
}
export function truncateVisible(s, width) {
    const limit = Math.max(0, Math.floor(width));
    if (limit === 0)
        return "";
    const safe = safeLine(s);
    if (visibleWidth(safe) <= limit)
        return safe;
    // Truncation deliberately removes styling. Segment the plain text first so
    // even an SGR transition inside a combining/ZWJ cluster cannot split it or
    // leave an active color behind. Fitting, safe strings retain their bytes.
    let out = "", cells = 0;
    for (const { segment } of graphemes.segment(stripVTControlCharacters(safe))) {
        const next = clusterWidth(segment);
        if (cells + next > limit - 1)
            break;
        out += segment;
        cells += next;
    }
    return out + "…";
}
// The one paint-width policy for every in-place painter (frames and the
// live line): a column of headroom, floored so a tiny terminal cannot
// produce a degenerate width. A tty that reports nothing — undefined OR
// zero (expect's PTYs report 0) — is unknown, not tiny, and paints at
// the 120 default. One definition — spinner.ts and paintFrame both call
// it, so truncation cannot drift between them.
export function paintWidth(columns) {
    const cols = columns !== undefined && columns > 0 ? columns : 120;
    return Math.max(10, cols - 1);
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
    const lines = frame.split("\n").map(l => truncateVisible(l, paintWidth(cols)) + "\x1b[K");
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
            paintFrame(stdout, f, stdout.columns);
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
