import { AnalysisFile, AnalysisSpans, AnalysisCalls, Mode } from "./contract.js";
import { analysisStatus, analyzeBindings, analyzeSpans, analyzeCalls } from "./analysis.js";
type Analyzer = typeof analyzeBindings;
type SpansAnalyzer = typeof analyzeSpans;
type Status = typeof analysisStatus;
export declare function clearAnalysisCache(): void;
export interface AnalysisRequestBody {
    kind?: unknown;
    file?: unknown;
    root?: unknown;
}
export type AnalysisResponse = {
    available: boolean;
    reason?: string;
} | {
    file: AnalysisFile;
} | {
    file: AnalysisSpans;
} | {
    file: AnalysisCalls;
} | {
    error: string;
};
export declare function handleAnalysisRequest(req: AnalysisRequestBody, mode: Mode, analyzer?: Analyzer, status?: Status, spansAnalyzer?: SpansAnalyzer, callsAnalyzer?: typeof analyzeCalls): AnalysisResponse;
export {};
