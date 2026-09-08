import { AnalysisFile, BindingInfo, BindingRef } from "./contract.js";
export type { AnalysisFile, BindingInfo, BindingRef };
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
export declare function analyzeBindings(file: string, source: string): AnalysisResult;
