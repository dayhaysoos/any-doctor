import { DoctorMeta, ExpectedFinding, Finding, narrowedCheckIds, ReportGroup, resolveFinding, Severity, VerifyRunResult } from "./contract.js";
import { BOLD, colorizer, DIM, GLYPH, GREEN, RED, scoreHeaderTone, SEVERITY_COLOR, YELLOW } from "./palette.js";
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
  /** Could the identity engine power this run? (D20 Stage 2) — checks
   * that declared `needs` render "narrowed" when false. */
  analysisAvailable?: boolean;
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

// The empty-scan warning's one copy: a run that scanned zero files must
// never read as a clean pass — "No findings" over nothing checked is
// the falsest green there is. It names what the walk looks for and what
// it skips, so a wrong-directory or all-tests target explains itself.
export function emptyScanLine(): string {
  return "nothing to check — no .ts, .tsx, .js, .jsx, or .mjs sources found (node_modules, hidden dirs, and test paths are skipped; --include-tests opts back in)";
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
  // A site claimed by one doctor is hidden when ANOTHER doctor claims it
  // too (same location, different doctor — one display copy). A second
  // check from the SAME doctor at the same site is a different diagnosis
  // of one line (filter-table-scan and unbounded-collect on one chain)
  // and survives — the check tree exists to show each check's own story.
  const owner = new Map<string, string>();
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
      const heldBy = owner.get(k);
      if (heldBy === undefined) {
        owner.set(k, g.meta.id);
        kept.push(f);
      } else if (heldBy !== g.meta.id) {
        hidden++;
      } else {
        kept.push(f);
      }
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
  lines.push(c(header.scoreLine, BOLD + scoreHeaderTone(header, sr.score)));
  if (header.cleanLine) {
    lines.push(c(header.cleanLine, DIM));
  }
  if (input.skippedUnsafe !== undefined && input.skippedUnsafe.length > 0) {
    lines.push(c(`\u26a0 ${unsafeSkipLine(input.skippedUnsafe)}`, YELLOW));
  }

  // The empty scan is its own outcome, not a clean one: no findings
  // headline, no per-doctor "clean" roll — those are claims a zero-file
  // scan has not earned. Degradation honesty survives it: narrowed
  // notices still render (visible, never silent). (Findings over a
  // zero count are still possible — a doctor reporting files it read
  // outside the default extensions — and fall through to render.)
  if (input.fileCount === 0 && total === 0) {
    if (input.crashed.length > 0) {
      lines.push(c(`\u26a0 nothing to check — every doctor crashed before completing a scan (${input.crashed.join(", ")}; details above)`, YELLOW));
    } else {
      lines.push(c(`\u26a0 ${emptyScanLine()}`, YELLOW));
    }
    pushNarrowedNotices(lines, groups, input.analysisAvailable, c);
    return lines.join("\n");
  }

  if (total === 0) {
    lines.push(c("No findings", BOLD + GREEN));
    if (groups.length > 1) {
      lines.push("");
      for (const g of groups) {
        lines.push(`${c("✔", GREEN)} ${c(g.meta.id, DIM)} — clean`);
      }
    }
    // A clean degraded run must never read as a full-power clean — the
    // narrowed notice renders here too, exactly as it does under
    // findings (D20 Stage 2's own words).
    pushNarrowedNotices(lines, groups, input.analysisAvailable, c);
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
    // The degradation contract as data (D20 Stage 2): checks that declared
    // analysis needs but ran without the engine say so — including checks
    // with zero findings, where a narrowed clean must never read as a
    // full-power clean.
    const narrowedIds = input.analysisAvailable === false ? narrowedCheckIds(g.meta) : [];
    if (narrowedIds.length > 0) {
      lines.push(`  ${c(narrowedLine(narrowedIds), YELLOW)}`);
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

// A diff entry's location includes its rule when it has one — the gate is
// rule-aware (D20), so the line must say which check was missing or extra.
function where(f: ExpectedFinding): string {
  return (f.rule ? f.rule + " " : "") + f.file + ":" + f.line;
}

// The narrowed notice's one wording (D20 Stage 2) — one source for every
// branch that renders it (clean, findings, and empty-scan).
function narrowedLine(checkIds: string[]): string {
  return `narrowed: analysis engine unavailable — ${checkIds.join(", ")} ran in degraded mode`;
}

// Degradation honesty survives every outcome shape: a run without the
// analysis engine says so whether it ended clean, with findings, or —
// over an empty scan — with nothing checked at all (visible, never
// silent).
function pushNarrowedNotices(
  lines: string[],
  groups: ReportGroup[],
  analysisAvailable: boolean | undefined,
  c: (s: string, wrap?: string) => string,
): void {
  if (analysisAvailable !== false) return;
  const notices = groups
    .map((g) => narrowedCheckIds(g.meta))
    .filter((ids) => ids.length > 0);
  if (notices.length > 0) {
    lines.push("");
    for (const ids of notices) {
      lines.push(c(narrowedLine(ids), YELLOW));
    }
  }
}

// Verify-gate rendering: pure state -> string, colored on request. The
// command layer prints it and counts failures from the data.
export function renderVerifyResult(result: VerifyRunResult, useColor: boolean): string {
  const c = colorizer(useColor);
  const lines: string[] = [];
  for (const fixture of result.results) {
    if (fixture.skipped !== undefined) {
      // An honest skip is data, not a pass: this fixture pins the
      // analysis-on path and the engine is not installed here.
      lines.push(c("  – " + fixture.name + " — skipped: " + fixture.skipped, DIM));
      continue;
    }
    if (fixture.ok) {
      lines.push(c("  ✔ " + fixture.name, GREEN));
    } else {
      lines.push(c("  ✖ " + fixture.name, RED));
      for (const m of fixture.missing) lines.push("    " + c("missing expected finding", RED) + " " + where(m));
      for (const u of fixture.unexpected) lines.push("    " + c("unexpected finding", RED) + " " + where(u));
      if (fixture.error) lines.push("    " + c("crashed: ", RED) + fixture.error);
    }
  }
  return lines.join("\n");
}
