import { DoctorMeta, Finding, ReportGroup, Severity } from "./contract.js";
import { categoryRollup, computeScore, findingSeverity } from "./score.js";

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m",
      ORANGE = "\x1b[38;5;208m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

const GLYPH: Record<Severity, string> = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR: Record<Severity, string> = { error: RED, warning: ORANGE, info: YELLOW };

export interface ReportInput {
  fileCount: number;
  durationMs: number;
  groups: ReportGroup[];
}

const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

function groupSeverity(g: ReportGroup): Severity {
  const explicit = g.findings.find(f => f.severity);
  return (explicit ? findingSeverity(g, explicit) : undefined) ?? g.meta.severity;
}

interface CheckBucket {
  ruleId: string | null;
  heading: string;
  severity: Severity;
  findings: Finding[];
}

function expandChecks(g: ReportGroup): CheckBucket[] {
  const buckets = new Map<string, CheckBucket>();
  for (const f of g.findings) {
    const check = f.rule ? g.meta.checks?.find(c => c.id === f.rule) : undefined;
    const key = f.rule ?? g.meta.id;
    if (!buckets.has(key)) {
      buckets.set(key, {
        ruleId: f.rule ?? null,
        heading: check?.description ?? g.meta.description,
        severity: check?.severity ?? g.meta.severity,
        findings: [],
      });
    }
    buckets.get(key)!.findings.push(f);
  }
  return [...buckets.values()];
}

export function dedupeGroups(groups: ReportGroup[]): { groups: ReportGroup[]; hidden: number } {
  const seen = new Set<string>();
  const key = (f: Finding): string => `${f.file}:${f.line}`;
  const ordered = [...groups].sort(
    (a, b) => SEVERITY_ORDER.indexOf(groupSeverity(a)) - SEVERITY_ORDER.indexOf(groupSeverity(b)));
  const out: ReportGroup[] = [];
  let hidden = 0;
  for (const g of ordered) {
    if (g.findings.length === 0) {
      out.push(g);
      continue;
    }
    const kept: Finding[] = [];
    for (const f of g.findings) {
      const k = key(f);
      if (seen.has(k)) {
        hidden++;
        continue;
      }
      seen.add(k);
      kept.push(f);
    }
    if (kept.length > 0) out.push({ ...g, findings: kept });
  }
  return { groups: out, hidden };
}

export function renderReport(input: ReportInput, useColor: boolean): string {
  const c = (s: string, wrap?: string): string => (useColor && wrap ? wrap + s + RESET : s);
  const lines: string[] = [];

  const { groups, hidden } = dedupeGroups(input.groups);
  const total = groups.reduce((n, g) => n + g.findings.length, 0);
  const { score, grade } = computeScore(groups);
  const gradeColor = score >= 75 ? GREEN : score >= 50 ? YELLOW : RED;

  lines.push(`✔ Scanned ${input.fileCount} files in ${input.durationMs}ms`);
  lines.push("");
  const doctorWord = groups.length === 1 ? "doctor" : "doctors";
  lines.push(c(`Any Doctor — ${groups.length} ${doctorWord}`, BOLD));
  lines.push(c(`Score: ${score} / 100 — ${grade}`, BOLD + gradeColor));

  if (total === 0) {
    lines.push(c("No issues found", BOLD + GREEN));
    if (groups.length > 1) {
      lines.push("");
      for (const g of groups) {
        lines.push(`${c("✔", GREEN)} ${c(g.meta.id, DIM)} — clean`);
      }
    }
    return lines.join("\n");
  }

  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const g of groups) {
    for (const f of g.findings) bySeverity[findingSeverity(g, f)]++;
  }
  const rollup = SEVERITY_ORDER
    .filter(s => bySeverity[s] > 0)
    .map(s => c(`${bySeverity[s]} ${s}`, COLOR[s]))
    .join(", ");

  lines.push("");
  lines.push(`${c(`${total} issue${total === 1 ? "" : "s"} found`, BOLD)}  ${c(`(${rollup})`, DIM)}`);
  for (const { category, counts } of categoryRollup(groups)) {
    const catParts = SEVERITY_ORDER.filter(s => counts[s] > 0).map(s => c(`${counts[s]} ${s}`, COLOR[s]));
    if (catParts.length > 0) {
      const cap = category.charAt(0).toUpperCase() + category.slice(1);
      lines.push(`${c(cap + ":", BOLD)} ${catParts.join(", ")}`);
    }
  }
  lines.push("");

  const ordered = [...groups].sort(
    (a, b) => SEVERITY_ORDER.indexOf(groupSeverity(a)) - SEVERITY_ORDER.indexOf(groupSeverity(b)));

  for (const g of ordered) {
    for (const bucket of expandChecks(g)) {
      const n = bucket.findings.length;
      lines.push(`${c(GLYPH[bucket.severity], COLOR[bucket.severity])} ${c(bucket.heading, n > 1 ? BOLD : "")}${n > 1 ? c(` ×${n}`, COLOR[bucket.severity]) : ""}`);
      lines.push(`  ${c(bucket.ruleId ? `${g.meta.id}/${bucket.ruleId}` : g.meta.id, DIM)}`);
      for (const f of bucket.findings.slice(0, 20)) {
        lines.push(`  ${f.file}:${f.line}`);
        if (f.message) lines.push(`    ${c(f.message, DIM)}`);
      }
      if (n > 20) lines.push(`  ${c(`… and ${n - 20} more`, DIM)}`);
      lines.push("");
    }
    if (g.findings.length > 0 && g.meta.blindSpots && g.meta.blindSpots.length > 0) {
      lines.push(`  ${c("blind spots: " + g.meta.blindSpots.join("; "), DIM)}`);
      lines.push("");
    }
  }

  if (hidden > 0) {
    lines.push(c(`${hidden} duplicate finding${hidden === 1 ? "" : "s"} hidden (same location, different doctor)`, DIM));
  }

  return lines.join("\n").replace(/\n+$/, "");
}
