import { Finding, ReportGroup, resolveFinding, Severity } from "./contract.js";

export interface ScoreResult {
  score: number;
  grade: string;
  filesClean: number;
  filesTotal: number;
}

// A file's burden by its worst finding: an error makes the file fully
// sick, a warning half, info barely. The score is the share of the scan
// that carries no findings at all — one sentence a user can verify by
// counting files: "491/628 files clean" is a 78.
const FILE_BURDEN: Record<Severity, number> = { error: 1, warning: 0.5, info: 0.1 };
const SEVERITY_ORDER: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

export function findingSeverity(g: ReportGroup, f: Finding): Severity {
  return resolveFinding(g.meta, f).severity;
}

export function gradeFor(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 25) return "Poor";
  return "Critical";
}

export function scoreFromFileHealth(perFile: { file: string; severity: Severity }[], filesTotal: number): ScoreResult {
  const worst = new Map<string, Severity>();
  for (const { file, severity } of perFile) {
    const cur = worst.get(file);
    if (cur === undefined || SEVERITY_ORDER[severity] > SEVERITY_ORDER[cur]) worst.set(file, severity);
  }
  let burden = 0;
  for (const s of worst.values()) burden += FILE_BURDEN[s];
  const score = filesTotal <= 0
    ? 100
    : Math.max(0, Math.min(100, Math.round(100 * (1 - burden / filesTotal))));
  return { score, grade: gradeFor(score), filesClean: Math.max(0, filesTotal - worst.size), filesTotal };
}

export function computeScore(groups: ReportGroup[], filesTotal: number): ScoreResult {
  return scoreFromFileHealth(
    groups.flatMap(g => g.findings.map(f => ({ file: f.file, severity: findingSeverity(g, f) }))),
    filesTotal,
  );
}

export function categoryRollup(groups: ReportGroup[]): { category: string; counts: Record<Severity, number> }[] {
  const map = new Map<string, Record<Severity, number>>();
  for (const g of groups) {
    const category = g.meta.category ?? "general";
    if (!map.has(category)) map.set(category, { error: 0, warning: 0, info: 0 });
    for (const f of g.findings) {
      map.get(category)![findingSeverity(g, f)]++;
    }
  }
  return [...map.entries()].map(([category, counts]) => ({ category, counts }));
}
