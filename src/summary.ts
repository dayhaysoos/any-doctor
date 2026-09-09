import { Finding, narrowedCheckIds, ReportGroup, resolveFinding, Severity } from "./contract.js";
import type { RunOutcome } from "./report.js";
import { categoryRollup, computeScore, findingSeverity, scoreHeaderLines, ScoreHeader, ScoreResult } from "./score.js";

// The Summary: the one derivation from a RunOutcome to everything its
// surfaces render — the report string and the dashboard tree today, a
// JSON adapter when the CI chapter arrives. Before this module, the
// derivation existed twice (renderReport and the dashboard each
// re-deduped, re-scored, and re-rolled up the same findings), and the
// facts a machine consumer needs — severity counts, the hidden-duplicate
// count, per-check rollups, narrowed ids — were locked inside rendering,
// nowhere as data. One derivation, N adapters: the "surfaces agree"
// invariant moved from a test into a module.
//
// Pure: derive twice from one RunOutcome, get one Summary. Rendering
// (colors, prose, trees) belongs to the adapters, never here.

// Worst-first display order — one home; the report's rollup rendering
// imports it rather than re-listing severities.
export const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

function groupSeverity(g: ReportGroup): Severity {
  const explicit = g.findings.find(f => f.severity);
  return (explicit ? findingSeverity(g, explicit) : undefined) ?? g.meta.severity;
}

// A site claimed by one doctor is hidden when ANOTHER doctor claims it
// too (same location, different doctor — one display copy). A second
// check from the SAME doctor at the same site is a different diagnosis
// of one line (filter-table-scan and unbounded-collect on one chain)
// and survives — the check tree exists to show each check's own story.
function dedupeGroups(groups: ReportGroup[]): { groups: ReportGroup[]; hidden: number } {
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

// One doctor's findings bucketed by check — the report's sections and
// the dashboard's collapsible check rows are two renderings of this
// one shape.
export interface CheckBucket {
  ruleId: string | null;
  heading: string;
  severity: Severity;
  findings: Finding[];
}

export interface GroupChecks {
  group: ReportGroup;
  checks: CheckBucket[];
  // Check ids that declared analysis needs but ran without the engine —
  // [] unless the run was degraded (D20 Stage 2's honesty data).
  narrowedIds: string[];
}

export interface RunSummary {
  // Deduped, severity-ordered — the groups every surface renders.
  groups: ReportGroup[];
  groupChecks: GroupChecks[];
  // Findings count after dedupe — the number the report headline and
  // the dashboard header must agree on.
  total: number;
  // Duplicates hidden by dedupe (same location, different doctor).
  hidden: number;
  score: ScoreResult;
  header: ScoreHeader;
  severityCounts: Record<Severity, number>;
  categories: { category: string; counts: Record<Severity, number> }[];
  // True when the scan saw zero files and produced zero findings — the
  // outcome that renders as n/a, never as clean.
  emptyScan: boolean;
}

export function deriveSummary(outcome: RunOutcome): RunSummary {
  const { groups, hidden } = dedupeGroups(outcome.groups);
  const total = groups.reduce((n, g) => n + g.findings.length, 0);
  const score = computeScore(groups, outcome.fileCount);
  const header = scoreHeaderLines(score);

  const severityCounts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const g of groups) {
    for (const f of g.findings) severityCounts[findingSeverity(g, f)]++;
  }

  const groupChecks: GroupChecks[] = groups.map(g => ({ group: g, checks: expandChecks(g), narrowedIds: outcome.analysisAvailable === false ? narrowedCheckIds(g.meta) : [] }));

  return {
    groups,
    groupChecks,
    total,
    hidden,
    score,
    header,
    severityCounts,
    categories: categoryRollup(groups),
    emptyScan: outcome.fileCount === 0 && total === 0,
  };
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
