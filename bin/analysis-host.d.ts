import { AnalysisFile, Mode } from "./contract.js";
import { analysisStatus, analyzeBindings } from "./analysis.js";
type Analyzer = typeof analyzeBindings;
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
    error: string;
};
export declare function handleAnalysisRequest(req: AnalysisRequestBody, mode: Mode, analyzer?: Analyzer, status?: Status): AnalysisResponse;
export {};
