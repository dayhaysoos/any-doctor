import { Severity } from "./contract.js";
import { gradeFor } from "./score.js";

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

// The score header's tone: an empty scan warns yellow — a vacuous 100
// must not buy the Excellent-green — and everything else follows its
// grade. Beside gradeColor because it is the same policy family; report
// and dashboard call this, never re-compose it (D19). Structurally typed
// so palette needs no import from score.
export function scoreHeaderTone(header: { emptyScan: boolean }, score: number): string {
  return header.emptyScan ? YELLOW : gradeColor(score);
}
