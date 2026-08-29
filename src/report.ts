import { Finding, Severity } from "./contract";

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m",
      DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

const GLYPH: Record<Severity, string> = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR: Record<Severity, string> = { error: RED, warning: YELLOW, info: CYAN };

export interface ReportInput {
  programName: string;
  description: string;
  severity: Severity;
  blindSpots?: string[];
  fileCount: number;
  durationMs: number;
  findings: Finding[];
}

export function renderReport(input: ReportInput, useColor: boolean): string {
  const c = (s: string, wrap?: string): string =>
    useColor && wrap ? wrap + s + RESET : s;
  const lines: string[] = [];

  lines.push(`✔ Scanned ${input.fileCount} files in ${input.durationMs}ms`);
  lines.push("");
  lines.push(c(`Any Doctor — ${input.programName}`, BOLD));

  if (input.findings.length === 0) {
    lines.push(c("No issues found", BOLD + GREEN));
    return lines.join("\n");
  }

  const effective = input.findings.map(f => f.severity ?? input.severity);
  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const s of effective) bySeverity[s]++;

  lines.push("");
  const parts = (["error", "warning", "info"] as Severity[])
    .filter(s => bySeverity[s] > 0)
    .map(s => c(`${bySeverity[s]} ${s}`, COLOR[s]));
  lines.push(`${c(`${input.findings.length} issue${input.findings.length === 1 ? "" : "s"} found`, BOLD)}  ${c(`(${parts.join(", ")})`, DIM)}`);
  lines.push("");
  lines.push(`${c(GLYPH[input.severity], COLOR[input.severity])} ${c(input.description, input.findings.length > 1 ? BOLD : "")}${input.findings.length > 1 ? c(` ×${input.findings.length}`, COLOR[input.severity]) : ""}`);
  lines.push(`  ${c(input.programName.replace(/\.(mjs|js)$/, ""), DIM)}`);
  for (const f of input.findings.slice(0, 20)) {
    lines.push(`  ${f.file}:${f.line}`);
    if (f.message) lines.push(`    ${c(f.message, DIM)}`);
  }
  if (input.findings.length > 20) {
    lines.push(`  ${c(`… and ${input.findings.length - 20} more`, DIM)}`);
  }
  if (input.blindSpots && input.blindSpots.length > 0) {
    lines.push("");
    lines.push(c("  Known blind spots:", DIM));
    for (const b of input.blindSpots) lines.push(`  ${c("- " + b, DIM)}`);
  }
  return lines.join("\n");
}
