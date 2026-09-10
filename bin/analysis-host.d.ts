import { AnalysisFile, AnalysisSpans, Mode } from "./contract.js";
import { analysisStatus, analyzeBindings, analyzeSpans } from "./analysis.js";
type Analyzer = typeof analyzeBindings;
type Spanzer = typeof analyzeSpans;
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
    error: string;
};
export declare function handleAnalysisRequest(req: AnalysisRequestBody, mode: Mode, analyzer?: Analyzer, status?: Status, spanzer?: Spanzer): AnalysisResponse;
export {};
