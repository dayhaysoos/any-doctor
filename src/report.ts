import { DoctorMeta, Finding, Severity } from "./contract";

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m",
      DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

const GLYPH: Record<Severity, string> = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR: Record<Severity, string> = { error: RED, warning: YELLOW, info: CYAN };

export interface ReportGroup {
  programName: string;
  meta: DoctorMeta;
  findings: Finding[];
}

export interface ReportInput {
  fileCount: number;
  durationMs: number;
  groups: ReportGroup[];
}

const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

export function renderReport(input: ReportInput, useColor: boolean): string {
  const c = (s: string, wrap?: string): string => (useColor && wrap ? wrap + s + RESET : s);
  const lines: string[] = [];

  lines.push(`✔ Scanned ${input.fileCount} files in ${input.durationMs}ms`);
  lines.push("");

  const total = input.groups.reduce((n, g) => n + g.findings.length, 0);
  const doctorWord = input.groups.length === 1 ? "doctor" : "doctors";
  lines.push(c(`Any Doctor — ${input.groups.length} ${doctorWord}`, BOLD));

  if (total === 0) {
    lines.push(c("No issues found", BOLD + GREEN));
    if (input.groups.length > 1) {
      lines.push("");
      for (const g of input.groups) {
        lines.push(`${c("✔", GREEN)} ${c(g.meta.id, DIM)} — clean`);
      }
    }
    return lines.join("\n");
  }

  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const g of input.groups) {
    for (const f of g.findings) bySeverity[f.severity ?? g.meta.severity]++;
  }
  const rollup = SEVERITY_ORDER
    .filter(s => bySeverity[s] > 0)
    .map(s => c(`${bySeverity[s]} ${s}`, COLOR[s]))
    .join(", ");

  lines.push("");
  lines.push(`${c(`${total} issue${total === 1 ? "" : "s"} found`, BOLD)}  ${c(`(${rollup})`, DIM)}`);
  lines.push("");

  const ordered = [...input.groups].sort((a, b) => {
    const sa = SEVERITY_ORDER.indexOf(a.findings.some(f => f.severity) ? (a.findings.find(f => f.severity)!.severity as Severity) : a.meta.severity);
    const sb = SEVERITY_ORDER.indexOf(b.findings.some(f => f.severity) ? (b.findings.find(f => f.severity)!.severity as Severity) : b.meta.severity);
    return sa - sb;
  });

  for (const g of ordered) {
    const n = g.findings.length;
    lines.push(`${c(GLYPH[g.meta.severity], COLOR[g.meta.severity])} ${c(g.meta.description, n > 1 ? BOLD : "")}${n > 1 ? c(` ×${n}`, COLOR[g.meta.severity]) : ""}`);
    lines.push(`  ${c(g.programName.replace(/\.(m|c)?js$/, ""), DIM)}`);
    for (const f of g.findings.slice(0, 20)) {
      lines.push(`  ${f.file}:${f.line}`);
      if (f.message) lines.push(`    ${c(f.message, DIM)}`);
    }
    if (n > 20) lines.push(`  ${c(`… and ${n - 20} more`, DIM)}`);
    if (g.meta.blindSpots && g.meta.blindSpots.length > 0 && g.findings.length > 0) {
      lines.push(`  ${c("blind spots: " + g.meta.blindSpots.join("; "), DIM)}`);
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n+$/, "");
}
