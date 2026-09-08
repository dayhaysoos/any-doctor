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

export interface ExpectedFinding {
  rule?: string;
  file: string;
  line: number;
}

export interface Fixture {
  name: string;
  seed: Record<string, string>;
  expected: ExpectedFinding[];
}

export const PROTOCOL_VERSION = 1;
export const RESULT_SENTINEL = "###ANY_DOCTOR_V1###";

// ctx.search host protocol: doctor children cannot spawn (permission
// model), so they ask the host to run ast-grep — request out fd 3, result
// back on stdin.
export const SEARCH_REQUEST = "###ANY_DOCTOR_SEARCH###";
export const SEARCH_RESULT = "###ANY_DOCTOR_SEARCH_RESULT###";

// One execution mode, constructed once and decoded once — never re-parsed
// from argv substrings. The runner builds it, serializes it at the spawn
// seam, and the loader decodes it on the other side.
export type Mode =
  | { kind: "run"; root: string; includeTests?: boolean }
  | { kind: "verify"; fixtures: string }
  | { kind: "meta" };

export function modeArgs(mode: Mode, programPath: string): string[] {
  switch (mode.kind) {
    case "run": return mode.includeTests === true
      ? [programPath, mode.root, "--include-tests"]
      : [programPath, mode.root];
    case "verify": return [programPath, "--verify", mode.fixtures];
    case "meta": return [programPath, "--meta"];
  }
}

export function decodeLoaderArgs(argv: string[]): { program: string; mode: Mode } | null {
  const [program, second, third] = argv;
  if (!program || program.startsWith("-")) return null;
  if (second === "--verify" && third !== undefined) return { program, mode: { kind: "verify", fixtures: third } };
  if (second === "--meta" && third === undefined) return { program, mode: { kind: "meta" } };
  if (second !== undefined && !second.startsWith("-") && (third === undefined || third === "--include-tests")) {
    return { program, mode: { kind: "run", root: second, ...(third === "--include-tests" ? { includeTests: true } : {}) } };
  }
  return null;
}

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
  missing: ExpectedFinding[];
  unexpected: ExpectedFinding[];
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

// A check id is a short kebab-case noun phrase naming the defect, unique within its doctor,
// over the charset [a-z0-9-] (never "/" — checkKey joins ids with it).
// Prefer naming the defect ("uncleared-settimeout-in-effect") over the
// pattern it searches for.

export function fixturesPathFor(programPath: string): string {
  return programPath.replace(DOCTOR_FILE_RE, "") + ".fixtures.mjs";
}

// D18's one law, in the conventions' home: test files and test directories
// are not production reads. Every read capability applies this predicate —
// the sdk walk prunes by it, the search host filters matches by it. Test
// FILES are test-named code files (.test./.spec. with a code extension);
// test DIRECTORIES are test/tests/__tests__ anywhere in the path.
const TEST_FILE_RE = /(?:\.test|\.spec)\.[cm]?[jt]sx?$/i;
const TEST_DIR_NAMES = new Set(["test", "tests", "__tests__"]);

export function isTestPath(relativePath: string): boolean {
  if (TEST_FILE_RE.test(relativePath)) return true;
  return relativePath.split(/[\\/]+/).some((seg) => TEST_DIR_NAMES.has(seg));
}

// One derivation, one home: a run scans test files only when --include-tests
// asks; a verify always sees everything its fixtures seed (D18) — the
// sandbox is the doctor's own world.
export function includeTestsFor(mode: Mode): boolean {
  if (mode.kind === "verify") return true;
  return mode.kind === "run" && mode.includeTests === true;
}

// The re-run command embedded in copied prompts. invoker defaults to
// the installed binary name; callers running via node or npx pass their own.
export function runCommandFor(doctorPath: string, root: string, invoker = "any-doctor"): string {
  return `${invoker} run "${doctorPath}" "${root}"`;
}

// The fixture gate, D20: rule-aware and multiset. The key is
// rule:file:line — a wrong-rule finding at the right line is both a
// missing expectation and an unexpected finding (the gate was rule-blind
// for multi-check doctors), and two findings where one was expected leave
// one unexpected (duplicates used to collapse into one satisfied entry).
// A finding or expectation without a rule keys on "" — rule-less expected
// matches rule-less findings only.
export function compareFindings(expected: ExpectedFinding[], actual: Finding[]): FixtureDiff {
  const key = (f: { rule?: string; file: string; line: number }): string => `${f.rule ?? ""}:${f.file}:${f.line}`;
  const asDiffEntry = (f: { rule?: string; file: string; line: number }): ExpectedFinding =>
    f.rule === undefined ? { file: f.file, line: f.line } : { rule: f.rule, file: f.file, line: f.line };

  // Expectations are a consumption budget per key: each matching actual
  // satisfies one, further actuals are unexpected, unsatisfied
  // expectations are missing.
  const budget = new Map<string, number>();
  for (const e of expected) budget.set(key(e), (budget.get(key(e)) ?? 0) + 1);

  const satisfied = new Map<string, number>();
  const unexpected: ExpectedFinding[] = [];
  for (const a of actual) {
    const k = key(a);
    const n = satisfied.get(k) ?? 0;
    if (n < (budget.get(k) ?? 0)) satisfied.set(k, n + 1);
    else unexpected.push(asDiffEntry(a));
  }

  const missing: ExpectedFinding[] = [];
  const reported = new Map<string, number>();
  for (const e of expected) {
    const k = key(e);
    const n = reported.get(k) ?? 0;
    if (n < (satisfied.get(k) ?? 0)) reported.set(k, n + 1);
    else missing.push(asDiffEntry(e));
  }
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

