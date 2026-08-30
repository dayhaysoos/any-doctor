export type Severity = "error" | "warning" | "info";

export interface DoctorMeta {
  id: string;
  description: string;
  severity: Severity;
  category?: string;
  blindSpots?: string[];
}

export interface ReportGroup {
  programName: string;
  meta: DoctorMeta;
  findings: Finding[];
}

export interface Finding {
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

export function compareFindings(expected: { file: string; line: number }[], actual: Finding[]): FixtureDiff {
  const key = (f: { file: string; line: number }): string => `${f.file}:${f.line}`;
  const expectedKeys = new Set(expected.map(key));
  const actualKeys = new Set(actual.map(key));
  const missing = expected.filter(f => !actualKeys.has(key(f))).map(f => ({ file: f.file, line: f.line }));
  const unexpected = actual.filter(f => !expectedKeys.has(key(f))).map(f => ({ file: f.file, line: f.line }));
  return { missing, unexpected };
}

