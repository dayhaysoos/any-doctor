export interface AnalysisStatus {
    available: true;
}
export type AnalysisStatusResult = AnalysisStatus | {
    available: false;
    reason: string;
};
export declare function analysisStatus(): AnalysisStatusResult;
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
}
export interface AnalysisFile {
    file: string;
    bindings: BindingInfo[];
}
export type AnalysisResult = {
    ok: true;
    file: AnalysisFile;
} | {
    ok: false;
    error: string;
};
export declare function analyzeBindings(file: string, source: string): AnalysisResult;
