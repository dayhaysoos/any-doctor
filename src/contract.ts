export type Severity = "error" | "warning" | "info";

export interface CheckMeta {
  id: string;
  description: string;
  severity?: Severity;
  impact?: string;
  why?: string;
  fix?: string;
}

export interface DoctorMeta {
  id: string;
  description: string;
  severity: Severity;
  category?: string;
  blindSpots?: string[];
  checks?: CheckMeta[];
}

export interface ReportGroup {
  programName: string;
  meta: DoctorMeta;
  findings: Finding[];
}

export interface Finding {
  rule?: string;
  file: string;
  line: number;
  column?: number;
  message?: string;
  severity?: Severity;
}

export interface Match {
  file: string;
  line: number;
  column: number;
  text: string;
}

export interface DoctorCtx {
  root: string;
  files: {
    list(exts?: string[]): string[];
    read(relativePath: string): string;
  };
  search: {
    pattern(pattern: string, language?: "TypeScript" | "JavaScript"): Match[];
  };
  report: {
    finding(f: Finding): void;
  };
}

export interface Fixture {
  name: string;
  seed: Record<string, string>;
  expected: { file: string; line: number }[];
}

export const PROTOCOL_VERSION = 1;
export const RESULT_SENTINEL = "###ANY_DOCTOR_V1###";

export interface RunResult {
  protocolVersion: number;
  kind: "run";
  root: string;
  fileCount: number;
  durationMs: number;
  meta: DoctorMeta;
  findings: Finding[];
}

export interface FixtureDiff {
  missing: { file: string; line: number }[];
  unexpected: { file: string; line: number }[];
}

export interface FixtureResult extends FixtureDiff {
  name: string;
  ok: boolean;
  error?: string;
}

export interface VerifyRunResult {
  protocolVersion: number;
  kind: "verify";
  meta: DoctorMeta;
  results: FixtureResult[];
}

export interface MetaResult {
  protocolVersion: number;
  kind: "meta";
  meta: DoctorMeta;
}

// The wire frames the loader emits behind the sentinel, as one union.
export type Frame = RunResult | VerifyRunResult | MetaResult;

// Filename conventions of the doctor contract — the one home for what is a
// doctor file, what is a fixture file, and where a doctor's fixtures live.
export const DOCTOR_FILE_RE = /\.(m|c)?js$/;
export const FIXTURES_FILE_RE = /\.fixtures\.(m|c)?js$/;

// A check id is a short kebab-case verb-phrase, unique within its doctor,
// over the charset [a-z0-9-] (never "/" — checkKey joins ids with it).
// Prefer naming the defect ("uncleared-settimeout-in-effect") over the
// pattern it searches for.

export function fixturesPathFor(programPath: string): string {
  return programPath.replace(DOCTOR_FILE_RE, "") + ".fixtures.mjs";
}

// The re-run command embedded in copied prompts. invoker defaults to
// the installed binary name; callers running via node or npx pass their own.
export function runCommandFor(doctorPath: string, root: string, invoker = "any-doctor"): string {
  return `${invoker} run "${doctorPath}" "${root}"`;
}

export function compareFindings(expected: { file: string; line: number }[], actual: Finding[]): FixtureDiff {
  const key = (f: { file: string; line: number }): string => `${f.file}:${f.line}`;
  const expectedKeys = new Set(expected.map(key));
  const actualKeys = new Set(actual.map(key));
  const missing = expected.filter(f => !actualKeys.has(key(f))).map(f => ({ file: f.file, line: f.line }));
  const unexpected = actual.filter(f => !expectedKeys.has(key(f))).map(f => ({ file: f.file, line: f.line }));
  return { missing, unexpected };
}

// The single home of the Finding↔Meta join. Every consumer — score, report,
// dashboard — projects from this record instead of re-implementing the
// lookup-and-fallback ladder.
export interface JoinedFinding {
  doctorId: string;
  checkId: string;
  checkKey: string;
  description: string;
  severity: Severity;
  declaredSeverity: Severity;
  category: string;
  impact?: string;
  why?: string;
  fix?: string;
  blindSpots?: string[];
  finding: Finding;
}

export function resolveFinding(meta: DoctorMeta, finding: Finding): JoinedFinding {
  const checkId = finding.rule ?? meta.id;
  const check = meta.checks?.find(c => c.id === checkId);
  return {
    doctorId: meta.id,
    checkId,
    checkKey: meta.id + "/" + checkId,
    description: check?.description ?? meta.description,
    severity: finding.severity ?? check?.severity ?? meta.severity,
    declaredSeverity: check?.severity ?? meta.severity,
    category: meta.category ?? "general",
    impact: check?.impact,
    why: check?.why,
    fix: check?.fix,
    blindSpots: meta.blindSpots,
    finding,
  };
}

