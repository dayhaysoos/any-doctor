import { DoctorMeta, Finding, ReportGroup, resolveFinding, Severity, VerifyRunResult } from "./contract.js";
import { BOLD, colorizer, DIM, GLYPH, gradeColor, GREEN, RED, SEVERITY_COLOR, YELLOW } from "./palette.js";
import { categoryRollup, computeScore, findingSeverity, scoreHeaderLines } from "./score.js";

// One scan invocation's batch of results — assembled once, consumed by the
// report, the dashboard, and any future surface. One defined meaning per
// field: the two cmdRun branches cannot drift because there is one type.
export interface RunOutcome {
  // The ReportGroups that ran — one per doctor that produced results.
  groups: ReportGroup[];
  // Doctor ids whose run crashed: data, named, results above are partial.
  crashed: string[];
  // Slugs Confinement refused to run — they ride along as the skip note.
  skippedUnsafe: string[];
  // Doctor id → program path, for composing re-run commands.
  doctorPaths: ReadonlyMap<string, string>;
  // The scanned target's file count (cohortFileCount of the doctors'
  // counts) — the Score's denominator (D19).
  fileCount: number;
  // Wall-clock of the doctor batch: first spawn to last completion,
  // discovery and selection excluded. Both branches, one meaning.
  durationMs: number;
  // The scanned target, for composing re-run commands.
  targetDir: string;
}

// All doctors scan the same target, so the cohort's file count is any
// doctor's count; the max is the honest pick when one crashed early. The
// policy lives here, beside the RunOutcome field it fills and the Score
// that divides by it.
export function cohortFileCount(counts: number[]): number {
  return counts.reduce((m, n) => Math.max(m, n), 0);
}

// The one place the skip-note copy lives; report, dashboard, and the CLI
// all render this sentence so the story is identical everywhere. The count
// is always the true total; only the name list caps — three names, then
// "… and N more" — so a hundred malicious doctors still cost one line.
const SKIP_NAMES_SHOWN = 3;

export function unsafeSkipLine(names: string[]): string {
  const shown = names.slice(0, SKIP_NAMES_SHOWN).join(", ");
  const rest = names.length - SKIP_NAMES_SHOWN;
  const list = rest > 0 ? `${shown} \u2026 and ${rest} more` : shown;
  return `${names.length} doctor${names.length === 1 ? "" : "s"} could be malicious — skipped: ${list}`;
}

// The refusal for a doctor you explicitly asked to run: the file, its
// capabilities, one line. The runner's DoctorUnsafe renderer and every
// caller share this so the refusal reads identically everywhere; detail
// lines ride beneath it when there are any.
export function unsafeRefusalLine(name: string, capabilities: readonly string[]): string {
  return `${name} could be malicious (${capabilities.join(", ")}) — not running it.`;
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
    const j = resolveFinding(g.meta, f);
    if (!buckets.has(j.checkKey)) {
      buckets.set(j.checkKey, {
        ruleId: f.rule ?? null,
        heading: j.description,
        severity: j.declaredSeverity,
        findings: [],
      });
    }
    buckets.get(j.checkKey)!.findings.push(f);
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

export function renderReport(input: RunOutcome, useColor: boolean): string {
  const c = colorizer(useColor);
  const lines: string[] = [];

  const { groups, hidden } = dedupeGroups(input.groups);
  const total = groups.reduce((n, g) => n + g.findings.length, 0);
  const sr = computeScore(groups, input.fileCount);
  const header = scoreHeaderLines(sr);

  lines.push(`✔ Scanned ${input.fileCount} files in ${input.durationMs}ms`);
  lines.push("");
  const doctorWord = groups.length === 1 ? "doctor" : "doctors";
  lines.push(c(`Any Doctor — ${groups.length} ${doctorWord}`, BOLD));
  lines.push(c(header.scoreLine, BOLD + gradeColor(sr.score)));
  if (header.cleanLine) {
    lines.push(c(header.cleanLine, DIM));
  }
  if (input.skippedUnsafe !== undefined && input.skippedUnsafe.length > 0) {
    lines.push(c(`\u26a0 ${unsafeSkipLine(input.skippedUnsafe)}`, YELLOW));
  }

  if (total === 0) {
    lines.push(c("No findings", BOLD + GREEN));
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
    .map(s => c(`${bySeverity[s]} ${s}`, SEVERITY_COLOR[s]))
    .join(", ");

  lines.push("");
  lines.push(`${c(`${total} finding${total === 1 ? "" : "s"}`, BOLD)}  ${c(`(${rollup})`, DIM)}`);
  for (const { category, counts } of categoryRollup(groups)) {
    const catParts = SEVERITY_ORDER.filter(s => counts[s] > 0).map(s => c(`${counts[s]} ${s}`, SEVERITY_COLOR[s]));
    if (catParts.length > 0) {
      const cap = category.charAt(0).toUpperCase() + category.slice(1);
      lines.push(`${c(cap + ":", BOLD)} ${catParts.join(", ")}`);
    }
  }
  lines.push("");

  // dedupeGroups already orders by severity; sorting again would duplicate it.
  for (const g of groups) {
    for (const bucket of expandChecks(g)) {
      const n = bucket.findings.length;
      lines.push(`${c(GLYPH[bucket.severity], SEVERITY_COLOR[bucket.severity])} ${c(bucket.heading, n > 1 ? BOLD : "")}${n > 1 ? c(` ×${n}`, SEVERITY_COLOR[bucket.severity]) : ""}`);
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

// Verify-gate rendering: pure state -> string, colored on request. The
// command layer prints it and counts failures from the data.
export function renderVerifyResult(result: VerifyRunResult, useColor: boolean): string {
  const c = colorizer(useColor);
  const lines: string[] = [];
  for (const fixture of result.results) {
    if (fixture.ok) {
      lines.push(c("  ✔ " + fixture.name, GREEN));
    } else {
      lines.push(c("  ✖ " + fixture.name, RED));
      for (const m of fixture.missing) lines.push("    " + c("missing expected finding", RED) + " " + m.file + ":" + m.line);
      for (const u of fixture.unexpected) lines.push("    " + c("unexpected finding", RED) + " " + u.file + ":" + u.line);
      if (fixture.error) lines.push("    " + c("crashed: ", RED) + fixture.error);
    }
  }
  return lines.join("\n");
}
