import { Finding, ReportGroup, resolveFinding, Severity } from "./contract.js";

export interface ScoreResult {
  score: number;
  grade: string;
}

const WEIGHTS: Record<Severity, number> = { error: 10, warning: 4, info: 1 };

export function findingSeverity(g: ReportGroup, f: Finding): Severity {
  return resolveFinding(g.meta, f).severity;
}

export function scoreFromSeverities(sevs: Severity[]): ScoreResult {
  let score = 100;
  for (const s of sevs) score -= WEIGHTS[s];
  score = Math.max(0, Math.min(100, score));
  let grade = "Critical";
  if (score >= 90) grade = "Excellent";
  else if (score >= 75) grade = "Good";
  else if (score >= 50) grade = "Fair";
  else if (score >= 25) grade = "Poor";
  return { score, grade };
}

export function computeScore(groups: ReportGroup[]): ScoreResult {
  let score = 100;
  for (const g of groups) {
    for (const f of g.findings) {
      score -= WEIGHTS[findingSeverity(g, f)];
    }
  }
  score = Math.max(0, Math.min(100, score));
  let grade = "Critical";
  if (score >= 90) grade = "Excellent";
  else if (score >= 75) grade = "Good";
  else if (score >= 50) grade = "Fair";
  else if (score >= 25) grade = "Poor";
  return { score, grade };
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
