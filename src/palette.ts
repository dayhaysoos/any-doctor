import { Severity } from "./contract.js";
import { gradeFor, isEmptyScan } from "./score.js";

// The severity palette: one home for how findings are glyphed and colored
// across the picker, report, and dashboard. Grade colors derive from
// score.ts's bands — nothing shadows them here.

export const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m",
      ORANGE = "\x1b[38;5;208m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

export const GLYPH: Record<Severity, string> = { error: "✖", warning: "⚠", info: "ℹ" };
export const SEVERITY_COLOR: Record<Severity, string> = { error: RED, warning: ORANGE, info: YELLOW };

export type Colorizer = (s: string, wrap?: string) => string;

export function colorizer(useColor: boolean): Colorizer {
  return (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
}

export function gradeColor(score: number): string {
  const grade = gradeFor(score);
  return grade === "Excellent" || grade === "Good" ? GREEN : grade === "Fair" ? YELLOW : RED;
}

// The score's tone, wherever a score renders — header line, bar, or a
// doctor's row: an empty scan warns yellow (a vacuous 100 must not buy
// the Excellent-green), everything else follows its grade. Takes the
// score result itself so no caller re-derives the empty-scan policy
// (D19: render the strings, never re-compose them). Param is
// structurally typed: palette's score imports stay value-level
// (gradeFor, isEmptyScan) — no type dependency rides along.
export function scoreHeaderTone(score: { score: number; filesTotal: number; partialScan?: boolean }): string {
  return isEmptyScan(score) || score.partialScan === true ? YELLOW : gradeColor(score.score);
}
