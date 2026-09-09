import { gradeFor, isEmptyScan } from "./score.js";
// The severity palette: one home for how findings are glyphed and colored
// across the picker, report, and dashboard. Grade colors derive from
// score.ts's bands — nothing shadows them here.
export const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", ORANGE = "\x1b[38;5;208m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";
export const GLYPH = { error: "✖", warning: "⚠", info: "ℹ" };
export const SEVERITY_COLOR = { error: RED, warning: ORANGE, info: YELLOW };
export function colorizer(useColor) {
    return (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
}
export function gradeColor(score) {
    const grade = gradeFor(score);
    return grade === "Excellent" || grade === "Good" ? GREEN : grade === "Fair" ? YELLOW : RED;
}
// The score's tone, wherever a score renders — header line, bar, or a
// doctor's row: an empty scan warns yellow (a vacuous 100 must not buy
// the Excellent-green), everything else follows its grade. Takes the
// score result itself so no caller re-derives the empty-scan policy
// (D19: render the strings, never re-compose them). Structurally typed
// so palette needs no import from score.
export function scoreHeaderTone(score) {
    return isEmptyScan(score) ? YELLOW : gradeColor(score.score);
}
