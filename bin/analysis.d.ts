import { AnalysisFile, AnalysisSpans, AnalysisCalls, BindingInfo, BindingRef, SpanInfo } from "./contract.js";
export type { AnalysisFile, AnalysisSpans, BindingInfo, BindingRef, SpanInfo };
export interface AnalysisStatus {
    available: true;
}
export type AnalysisStatusResult = AnalysisStatus | {
    available: false;
    reason: string;
};
export declare const SEMANTIC_PROVIDER_ID = "any-doctor/syntax-flow";
export declare const SEMANTIC_PROVIDER_VERSION = "1";
export declare function semanticProviderProvenance(): import("./contract.js").SemanticProviderProvenance;
export declare function analysisStatus(): AnalysisStatusResult;
export type AnalysisResult = {
    ok: true;
    file: AnalysisFile;
} | {
    ok: false;
    error: string;
};
export type CallsResult = {
    ok: true;
    file: AnalysisCalls;
} | {
    ok: false;
    error: string;
};
export type SpansResult = {
    ok: true;
    file: AnalysisSpans;
} | {
    ok: false;
    error: string;
};
export declare function analyzeSpans(file: string, source: string): SpansResult;
export declare function analyzeBindings(file: string, source: string): AnalysisResult;
export type Node = {
    type: string;
    range?: [number, number];
    [k: string]: unknown;
};
export declare function analyzeCalls(file: string, source: string): CallsResult;
/** Host-only AST/scope seam. Doctors receive bounded derived facts, never ASTs. */
export declare function analyzeSyntax(file: string, source: string): {
    program: Node;
    scopes: import("@typescript-eslint/scope-manager").ScopeManager;
};
