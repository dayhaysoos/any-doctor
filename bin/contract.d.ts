export type Severity = "error" | "warning" | "info";
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
export declare const DEFAULT_EXTS: string[];
export interface CrashedDoctor {
    id: string;
    detail: string;
}
export interface RunOutcome {
    groups: ReportGroup[];
    crashed: CrashedDoctor[];
    skippedUnsafe: string[];
    doctorPaths: ReadonlyMap<string, string>;
    fileCount: number;
    durationMs: number;
    targetDir: string;
    /** Could the identity engine power this run? (D20 Stage 2) — checks
     * that declared `needs` render "narrowed" when false. */
    analysisAvailable?: boolean;
}
export declare function cohortFileCount(counts: number[]): number;
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
    endLine?: number;
    endColumn?: number;
    captures?: Record<string, Capture | Capture[]>;
    ruleId?: string;
}
export interface Capture {
    text: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
}
export interface RuleQuery {
    pattern: string;
    inside?: RuleInside;
}
export interface RuleInside {
    pattern: string;
    stopBy?: "end" | "neighbor";
}
export interface NamedRuleQuery {
    id: string;
    pattern: string;
    inside?: RuleInside;
}
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
    start: number;
    end: number;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
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
    registration?: {
        target: CallTarget;
        property: string | null;
        argument: number;
    };
}
export interface OperandInfo {
    call?: number;
    binding?: number;
}
export interface AnalysisCalls {
    file: string;
    calls: CallInfo[];
    functions: FunctionInfo[];
    differences: (SourceRange & {
        functionStart: number | null;
        left: OperandInfo;
        right: OperandInfo;
    })[];
}
export interface DoctorCtx {
    root: string;
    files: {
        list(exts?: string[]): string[];
        read(relativePath: string): string;
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
export declare const PROTOCOL_VERSION = 1;
export declare const RESULT_SENTINEL = "###ANY_DOCTOR_V1###";
export declare const SEARCH_REQUEST = "###ANY_DOCTOR_SEARCH###";
export declare const SEARCH_RESULT = "###ANY_DOCTOR_SEARCH_RESULT###";
export type SearchOp = "pattern" | "rule" | "rules" | "analysis";
export declare function decodeSearchOp(op: unknown): {
    op: SearchOp;
} | {
    error: string;
};
export type Mode = {
    kind: "run";
    root: string;
    includeTests?: boolean;
} | {
    kind: "verify";
    fixtures: string;
} | {
    kind: "meta";
};
export declare function modeArgs(mode: Mode, programPath: string): string[];
export declare function decodeLoaderArgs(argv: string[]): {
    program: string;
    mode: Mode;
} | null;
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
    capabilities?: {
        analysis: boolean;
    };
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
export type Frame = RunResult | VerifyRunResult | MetaResult;
export declare const DOCTOR_FILE_RE: RegExp;
export declare const FIXTURES_FILE_RE: RegExp;
export declare function fixturesPathFor(programPath: string): string;
export declare function isTestPath(relativePath: string): boolean;
export declare function withinBase(root: string, base: string): boolean;
export declare function searchBase(mode: Mode): string;
export declare function includeTestsFor(mode: Mode): boolean;
export declare function runCommandFor(doctorPath: string, root: string, invoker?: string): string;
export declare function compareFindings(expected: ExpectedFinding[], actual: Finding[]): FixtureDiff;
export declare function narrowedCheckIds(meta: DoctorMeta): string[];
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
export declare function resolveFinding(meta: DoctorMeta, finding: Finding): JoinedFinding;
