import { DoctorMeta, Finding, JoinedFinding, ReportGroup, resolveFinding, Severity, severityRank } from "./contract.js";
import { scoreFromFileHealth, ScoreResult } from "./score.js";
import type { GroupChecks } from "./summary.js";

// The Doctor tree: the dashboard's view-model, computed once and named —
// doctor → checks → findings, ordered for triage (worst severity first,
// count descending). It CONSUMES the Summary's per-doctor check buckets
// (groupChecks) rather than re-bucketing the groups: one derivation, N
// adapters — the tree flattens and joins (Finding↔Meta), it never
// re-groups. Extracted from the dashboard (with the prompts that consume
// its types) so the TUI loop renders the tree without owning its shape,
// and M2's review state can key off SiteFinding.readKey without piercing
// the loop.

// A JoinedFinding pinned to one dashboard row: the join supplies every
// field; site replaces finding for the frame code.
export type SiteFinding = { readKey: string; site: Finding } & Omit<JoinedFinding, "finding">;

// The Finding↔Meta join as a flat list. Production trees join per-bucket
// (siteOf inside buildTree); buildItems serves tests and any flat-item
// consumer that wants the same join.
function siteOf(meta: DoctorMeta, f: Finding): SiteFinding {
  const j = resolveFinding(meta, f);
  return { ...j, readKey: j.checkKey + "@" + f.file + ":" + f.line, site: f };
}

export function buildItems(groups: ReportGroup[]): SiteFinding[] {
  const items: SiteFinding[] = [];
  for (const g of groups) {
    for (const f of g.findings) {
      items.push(siteOf(g.meta, f));
    }
  }
  return items;
}

export interface DoctorSummary {
  doctorId: string;
  description: string;
  worst: Severity;
  count: number;
  files: number;
  // This doctor's findings against the same denominator the repo-wide
  // score uses — its own health, not a share of the header's number.
  score: ScoreResult;
  checks: { description: string; severity: Severity; count: number }[];
  blindSpots?: string[];
}

export interface CheckSummary {
  checkKey: string;
  checkId: string;
  doctorId: string;
  description: string;
  severity: Severity;
  impact?: string;
  why?: string;
  fix?: string;
  blindSpots?: string[];
  count: number;
  files: number;
}

export interface DoctorGroup {
  doctorId: string;
  checks: { checkKey: string; items: SiteFinding[] }[];
  multiCheck: boolean;
  count: number;
  worst: Severity;
  score: ScoreResult;
}

export type DoctorTree = DoctorGroup[];

// The re-scan loop is the pagination: a check shows its first N findings,
// then an affordance to fix a few and run again.
export const FINDINGS_PER_CHECK = 50;

export function buildTree(groupChecks: GroupChecks[], filesTotal: number): DoctorTree {
  // One GroupChecks entry is one doctor's deduped findings, already
  // bucketed per check by the Summary — the tree joins and orders, it
  // never re-groups.
  const doctors: DoctorGroup[] = groupChecks.map((gc) => {
    const entries = gc.checks.map((bucket) => {
      const items = bucket.findings
        .map((f) => siteOf(gc.group.meta, f))
        .sort((a, b) => a.site.file === b.site.file
          ? a.site.line - b.site.line
          : a.site.file < b.site.file ? -1 : 1);
      return { checkKey: items[0].checkKey, items };
    }).sort((a, b) => {
      const sa = severityRank(a.items[0].declaredSeverity);
      const sb = severityRank(b.items[0].declaredSeverity);
      return sa !== sb ? sa - sb : b.items.length - a.items.length || (a.checkKey < b.checkKey ? -1 : 1);
    });
    return {
      doctorId: gc.group.meta.id,
      checks: entries,
      multiCheck: entries.length > 1,
      count: entries.reduce((n, g) => n + g.items.length, 0),
      worst: entries.reduce((w, g) => (
        severityRank(g.items[0].severity) < severityRank(w) ? g.items[0].severity : w
      ), "info" as Severity),
      score: scoreFromFileHealth(
        entries.flatMap(g => g.items.map(it => ({ file: it.site.file, severity: it.severity }))),
        filesTotal,
      ),
    };
  });
  // Triage order: worst severity first, then most findings, then name.
  return doctors.sort((a, b) =>
    severityRank(a.worst) - severityRank(b.worst)
    || b.count - a.count
    || (a.doctorId < b.doctorId ? -1 : 1));
}

export function summarizeCheck(checkKey: string, groupItems: SiteFinding[]): CheckSummary {
  const first = groupItems[0];
  const files = new Set(groupItems.map(i => i.site.file));
  return {
    checkKey,
    checkId: first.checkId,
    doctorId: first.doctorId,
    description: first.description,
    severity: first.declaredSeverity,
    impact: first.impact,
    why: first.why,
    fix: first.fix,
    blindSpots: first.blindSpots,
    count: groupItems.length,
    files: files.size,
  };
}

export function summarizeDoctor(d: DoctorGroup): DoctorSummary {
  const first = d.checks[0]?.items[0];
  const files = new Set<string>();
  for (const g of d.checks) for (const i of g.items) files.add(i.site.file);
  return {
    doctorId: d.doctorId,
    description: first ? first.description : d.doctorId,
    worst: d.worst,
    count: d.count,
    files: files.size,
    score: d.score,
    checks: d.checks.map(g => ({
      description: g.items[0].description,
      severity: g.items[0].declaredSeverity,
      count: g.items.length,
    })),
    blindSpots: first?.blindSpots,
  };
}

// Errors open on entry: any doctor carrying error findings, any
// error-severity check, and the top of the list so the first screen is
// never an empty overview. Everything else starts collapsed.
export function initialExpanded(tree: DoctorTree): Set<string> {
  const expanded = new Set<string>();
  const multiDoctor = tree.length > 1;
  tree.forEach((d, i) => {
    if (multiDoctor && (d.worst === "error" || i === 0)) expanded.add(d.doctorId);
    if (!d.multiCheck) return;
    for (const g of d.checks) {
      if (g.items[0].declaredSeverity === "error") expanded.add(g.checkKey);
    }
  });
  return expanded;
}
