import { AnalysisFile, AnalysisSpans, BindingInfo, BindingRef, SpanInfo } from "./contract.js";
export type { AnalysisFile, AnalysisSpans, BindingInfo, BindingRef, SpanInfo };
export interface AnalysisStatus {
    available: true;
}
export type AnalysisStatusResult = AnalysisStatus | {
    available: false;
    reason: string;
};
export declare function analysisStatus(): AnalysisStatusResult;
export type AnalysisResult = {
    ok: true;
    file: AnalysisFile;
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
