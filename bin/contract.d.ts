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
    endLine?: number;
    endColumn?: number;
    captures?: Record<string, Capture | Capture[]>;
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
export interface DoctorCtx {
    root: string;
    files: {
        list(exts?: string[]): string[];
        read(relativePath: string): string;
    };
    search: {
        pattern(pattern: string, language?: "TypeScript" | "JavaScript"): Match[];
        rule(query: RuleQuery, language?: "TypeScript" | "JavaScript"): Match[];
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
export declare const PROTOCOL_VERSION = 1;
export declare const RESULT_SENTINEL = "###ANY_DOCTOR_V1###";
export declare const SEARCH_REQUEST = "###ANY_DOCTOR_SEARCH###";
export declare const SEARCH_RESULT = "###ANY_DOCTOR_SEARCH_RESULT###";
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
export type Frame = RunResult | VerifyRunResult | MetaResult;
export declare const DOCTOR_FILE_RE: RegExp;
export declare const FIXTURES_FILE_RE: RegExp;
export declare function fixturesPathFor(programPath: string): string;
export declare function isTestPath(relativePath: string): boolean;
export declare function includeTestsFor(mode: Mode): boolean;
export declare function runCommandFor(doctorPath: string, root: string, invoker?: string): string;
export declare function compareFindings(expected: ExpectedFinding[], actual: Finding[]): FixtureDiff;
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
