import * as os from "os";
import * as path from "path";

export type Severity = "error" | "warning" | "info";

// The one severity ordering — worst first. Display rollups (report),
// derivation sorts (summary), and view-model triage (doctor tree) all
// rank through this; score weights and the gate's fail-on bar are
// different questions and keep their own tables.
export const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

export interface CheckMeta {
  id: string;
  description: string;
  severity?: Severity;
  impact?: string;
  why?: string;
  fix?: string;
  /** Analysis capabilities this check uses at full power; without them it
   * narrows and says so in the report (D20's honest degradation). v1
   * vocabulary: ["bindings"], ["spans"]. */
  needs?: string[];
  // The claim contract (D23): a check states the OBSERVABLE condition it
  // establishes, the innocent shapes that must stay silent, and - when it
  // depends on the identity engine - what happens when the answer is
  // unknown. Enforced at verify: a check without a claim cannot be
  // certified, because eloquent impact prose is not a testable statement.
  /** One sentence: the observable condition this check establishes. Not the
   *  consequence ("this is unsafe") - the thing actually detected. */
  claim?: string;
  /** Innocent lookalike shapes that must remain silent (corpus candidates). */
  lookalikes?: string[];
  /** When analysis the check needs is unavailable: "narrow" (report says
   *  narrowed) or "skip" (silent, declared in blindSpots). */
  onUnknown?: "narrow" | "skip";
  /** Unit counted by certification; occurrence checks require a two-location witness. */
  reportingUnit?: "occurrence" | "file" | "project";
  /** Semantic revision of this check's MEANING, authored by hand: bump it
   *  when the check detects something different; cosmetic doctor edits do
   *  not bump it. Recorded decisions stay compatible while the revision is
   *  unchanged; without a revision, the whole-program digest governs (and
   *  any doctor edit resurfaces decisions — the churn revision prevents). */
  revision?: number;
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

// The default walk's extensions — the empty-scan warning names them in
// prose; composing from the array is what keeps the copy honest the day
// this list changes.
export const DEFAULT_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

// One doctor whose run crashed: a crash is data. The id is the
// discovery id (or the program's file name without .mjs when selected
// by path); the detail is the full describeRunnerError rendering,
// carried so any surface — report, dashboard, or a future machine
// consumer — can name the failure without re-deriving it.
export interface CrashedDoctor {
  id: string;
  detail: string;
}

// One scan invocation's batch of results — assembled once, consumed by the
// report, the dashboard, and any future surface. One defined meaning per
// field: the command layer cannot drift because there is one type, and
// one module (the Cohort) assembles it.
export interface RunOutcome {
  // The ReportGroups that ran — one per doctor that produced results.
  groups: ReportGroup[];
  // Doctors whose runs crashed: data, named with full detail, results
  // above are partial.
  crashed: CrashedDoctor[];
  // Slugs Confinement refused to run — they ride along as the skip note.
  skippedUnsafe: string[];
  // Doctor id → program path, for composing re-run commands.
  doctorPaths: ReadonlyMap<string, string>;
  // The scanned target's file count (cohortFileCount of the doctors'
  // counts) — the Score's denominator (D19).
  fileCount: number;
  // Wall-clock of the doctor batch: first spawn to last completion,
  // discovery and selection excluded — measured once, by the Cohort.
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

export interface FindingEvidence {
  /** The expression's last line (1-based, same convention as `line`). */
  endLine: number;
  /** Exclusive end column on that line (0-based); omitted = through EOL. */
  endColumn?: number;
}

export interface Finding {
  rule?: string;
  file: string;
  line: number;
  column?: number;
  message?: string;
  severity?: Severity;
  /** Optional evidence range covering the whole flagged expression — the
   *  host validates it against the source and digests the covered span, so
   *  an edit on a continuation line of a multiline expression still breaks
   *  identity. Omit it and identity falls back to the flagged line alone
   *  (line-scoped: explicitly weaker, surfaced as such). */
  evidence?: FindingEvidence;
}

export interface Match {
  file: string;
  line: number;
  column: number;
  text: string;
  // D20 Stage 1: a match carries its extent and its metavariable
  // captures — the engine already parsed them; the seam no longer
  // subtracts them. Lines are 1-based; columns pass through as the
  // engine reports them (0-based), as they always have.
  endLine?: number;
  endColumn?: number;
  captures?: Record<string, Capture | Capture[]>;
  // D20 Stage 2: a multi-rule query tags each match with the id of the
  // rule that found it.
  ruleId?: string;
}

// One metavariable capture: the matched sub-node's text and extent.
// Multi-metavariables ($$$NAME) capture an array of these under the bare
// NAME; single metavariables ($NAME) capture one.
export interface Capture {
  text: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

// A Rule query (CONTEXT.md): a composite structural question. `pattern`
// is what to match; `inside` constrains it to occur within another
// pattern, scanned to that enclosing node's end by default (stopBy) —
// deliberately not ast-grep's own neighbor default, which the repair log
// shows is almost never what a check means.
export interface RuleQuery {
  pattern: string;
  inside?: RuleInside;
}

export interface RuleInside {
  pattern: string;
  stopBy?: "end" | "neighbor";
}

// A named rule for the multi-rule query: several questions, ONE engine
// invocation (each spawn costs ~an engine process start regardless of
// repo size — batching is how a check with many shapes stays fast).
export interface NamedRuleQuery {
  id: string;
  pattern: string;
  inside?: RuleInside;
}

// The identity model ctx.analysis returns (CONTEXT.md: Analysis query,
// Binding, Reference). Lines 1-based, columns 0-based — ctx.search's
// convention, so reference positions compose with Match positions.
export interface BindingRef {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  write: boolean;
}

export interface BindingInfo {
  name: string;
  kind: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  references: BindingRef[];
  /** Named-exported from this module — computed from the export AST, not
   *  text: every declarator of an export statement, specifiers, defaults. */
  exported?: boolean;
  /** Declared in an object pattern with a rest sibling — the intentional
   *  omission idiom (`const { secret: _s, ...safe } = x`). Not dead code. */
  excluded?: boolean;
}

export interface AnalysisFile {
  file: string;
  bindings: BindingInfo[];
}

// One function-like span, an AST fact (D26): where every function, method,
// arrow, and class begins and ends — the brace-counting copies the doctors
// carried could only approximate this, and the approximation is where the
// audit truncation bugs lived. Lines 1-based, columns 0-based, ctx.search's
// convention. `name` is null for anonymous arrows and expressions.
export interface SpanInfo {
  kind: "function" | "function-expression" | "method" | "arrow" | "class";
  name: string | null;
  async: boolean;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface AnalysisSpans {
  file: string;
  spans: SpanInfo[];
}

/** Generic syntax facts. Offsets are UTF-16, ends exclusive; no framework policy. */
export interface SourceRange {
  start: number; end: number;
  line: number; column: number; endLine: number; endColumn: number;
}
export interface CallTarget {
  root: string | null;
  members: string[];
  /** Declaration identifier offset, null for an unresolved/global receiver. */
  binding: number | null;
  source?: string;
  importedName?: string;
  reassigned?: boolean;
}
export interface CallInfo extends SourceRange {
  target: CallTarget;
  usage: "discarded" | "awaited" | "returned" | "stored" | "passed" | "unknown";
  functionStart: number | null;
  resultBinding?: number;
  /** Exclusive end offset of a call used as this call's receiver. */
  receiverCall?: number;
  memberRange?: SourceRange;
  arguments: SourceRange[];
}
export interface FunctionInfo extends SourceRange {
  parameters: (number | null)[];
  registration?: { target: CallTarget; property: string | null; argument: number };
}
export interface OperandInfo { call?: number; binding?: number }
export interface AnalysisCalls {
  file: string;
  calls: CallInfo[];
  functions: FunctionInfo[];
  differences: (SourceRange & { functionStart: number | null; left: OperandInfo; right: OperandInfo })[];
}

export interface DoctorCtx {
  root: string;
  files: {
    list(exts?: string[]): string[];
    read(relativePath: string): string;
    // The one masking implementation (D20 Stage 1): comments, strings, and regex literals
    // blanked, offsets and length preserved — a doctor indexes into it
    // with positions that line up with the raw source. Doctors stopped
    // carrying private copies the single-file law forced on them.
    readMasked(relativePath: string): string;
  };
  search: {
    pattern(pattern: string, language?: "TypeScript" | "JavaScript"): Match[];
    rule(query: RuleQuery, language?: "TypeScript" | "JavaScript"): Match[];
    /** Many named rules, one engine invocation. Matches carry `ruleId`.
     * Prefer this over N `rule()` calls — each call is a process spawn. */
    rules(queries: NamedRuleQuery[], language?: "TypeScript" | "JavaScript"): Match[];
  };
  analysis: {
    /** Honest yes/no: is the identity engine installed? Cheap and cached.
     * Checks that narrow without it declare `needs` on their CheckMeta and
     * the report says "narrowed". */
    readonly available: boolean;
    /** One file in, its whole identity model out: every binding with its
     * declaration span and all references (positions + read/write).
     * Throws loudly when unavailable — check `available` first. */
    bindings(file: string): AnalysisFile;
    /** One file in, every function-like span out (functions, methods,
     * arrows, classes) with decl-name, asyncness, and extent — an AST
     * fact, not a brace-count. Throws loudly when unavailable. */
    spans(file: string): AnalysisSpans;
    /** Calls, immediate uses, callback registrations and subtraction operands. */
    calls(file: string): AnalysisCalls;
  };
  report: {
    finding(f: Finding): void;
  };
}

export interface ExpectedFinding {
  rule?: string;
  file: string;
  line: number;
  /** Omitted columns preserve legacy line-only expectations. */
  column?: number;
}

export interface Fixture {
  name: string;
  seed: Record<string, string>;
  expected: ExpectedFinding[];
  /** Which analysis mode this fixture pins (D20 Stage 2): "on" (default)
   * runs with the identity engine — and skips with a named notice when it
   * is not installed in the environment; "off" forces the degraded path,
   * pinning the narrowed behavior a check falls back to. */
  analysis?: "on" | "off";
}

export const PROTOCOL_VERSION = 1;
export const RESULT_SENTINEL = "###ANY_DOCTOR_V1###";

// ctx.search host protocol: doctor children cannot spawn (permission
// model), so they ask the host to run ast-grep — request out fd 3, result
// back on stdin.
export const SEARCH_REQUEST = "###ANY_DOCTOR_SEARCH###";
export const SEARCH_RESULT = "###ANY_DOCTOR_SEARCH_RESULT###";

// The channel's operation vocabulary, decoded in one home. Unknown ops
// are LOUD errors — a typo'd op silently degrading to a pattern search is
// the silent-failure class this seam refuses (D20 Stage 2).
export type SearchOp = "pattern" | "rule" | "rules" | "analysis";

export function decodeSearchOp(op: unknown): { op: SearchOp } | { error: string } {
  if (op === "pattern" || op === "rule" || op === "rules" || op === "analysis") return { op };
  return {
    error: `unknown search-channel op ${JSON.stringify(op)} — known ops: ${["pattern", "rule", "rules", "analysis"].join(", ")}`,
  };
}

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
  /** What the host could actually power for this run (D20 Stage 2): the
   * identity engine's presence, so "narrowed" rendering is data. */
  capabilities?: { analysis: boolean };
}

export interface FixtureDiff {
  missing: ExpectedFinding[];
  unexpected: ExpectedFinding[];
}

export interface FixtureResult extends FixtureDiff {
  name: string;
  ok: boolean;
  error?: string;
  /** An honest skip (not a failure): this fixture pins the analysis-on
   * path and the engine is not installed here. */
  skipped?: string;
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

// One law, in the conventions' home: test files and test directories
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

// The read-containment laws, one home each. withinDir is the strict
// form — the path IS the directory or lies beneath it — and is what a
// repo root, a sandbox dir, an evidence read, or a per-file check
// enforces. withinBase guards BASES, which the channel hosts derive per
// mode: a run's target directory, or verify's mkdtemp sandbox PREFIX
// (any any-doctor-verify-* dir qualifies — hence the anchored form for
// dash-suffixed bases). Private copies are how the `..`-resolution
// subtlety gets forgotten (resolve() collapses it; a raw prefix check
// would let /target/../../etc through). Fusing the two forms would WIDEN
// strict roots whose path happens to end in "-" — found in review; kept
// apart on purpose.
export function withinDir(p: string, dir: string): boolean {
  return p === dir || p.startsWith(dir + path.sep);
}

export function withinBase(root: string, base: string): boolean {
  return base.endsWith("-") ? root.startsWith(base) : withinDir(root, base);
}

// The base a mode's reads must stay within: a run's target directory, a
// verify's sandbox prefix under the temp dir, or nothing for meta (meta
// may not read at all). Pure function of the Mode — placed with it.
export function searchBase(mode: Mode): string {
  switch (mode.kind) {
    case "verify": return path.join(os.tmpdir(), "any-doctor-verify-");
    case "run": return mode.root;
    case "meta": return "";
  }
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
  const key = (f: ExpectedFinding): string => JSON.stringify([f.rule ?? "", f.file, f.line]);
  const entry = (f: ExpectedFinding): ExpectedFinding => ({
    ...(f.rule === undefined ? {} : { rule: f.rule }), file: f.file, line: f.line,
    ...(f.column === undefined ? {} : { column: f.column }),
  });
  const budget = new Map<string, { expected: ExpectedFinding; used: boolean }[]>();
  for (const e of expected) {
    const rows = budget.get(key(e)) ?? [];
    rows.push({ expected: e, used: false }); budget.set(key(e), rows);
  }
  const unexpected: ExpectedFinding[] = [];
  for (const a of actual) {
    const rows = budget.get(key(a)) ?? [];
    // Consume exact columns before legacy wildcard expectations.
    const match = rows.find(r => !r.used && r.expected.column !== undefined && r.expected.column === a.column)
      ?? rows.find(r => !r.used && r.expected.column === undefined);
    if (match) match.used = true;
    else unexpected.push(entry(a));
  }
  const missing = [...budget.values()].flatMap(rows => rows.filter(r => !r.used).map(r => entry(r.expected)));
  return { missing, unexpected };
}

// The degradation contract's one projection (D20 Stage 2): which checks
// of this doctor declared analysis needs — the ids the report names when
// it renders "narrowed", and the predicate verify uses to decide whether
// analysis-on fixtures apply.
export function narrowedCheckIds(meta: DoctorMeta): string[] {
  return (meta.checks ?? []).filter((c) => c.needs !== undefined && c.needs.length > 0).map((c) => c.id);
}

// The within-run occurrence handle: checkKey plus coordinates, COLUMN
// INCLUDED — two findings on one line are two occurrences, and one
// decision must never hide both (the review-probe bug: this key dropped
// columns, so display filters suppressed by line). One home — the
// identity layer keys evidence by it, decisions address findings by it,
// and every surface composes it from these parts.
export function readKeyFor(checkKey: string, file: string, line: number, column?: number): string {
  return `${checkKey}@${file}:${line}${column !== undefined ? `:${column}` : ""}`;
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

