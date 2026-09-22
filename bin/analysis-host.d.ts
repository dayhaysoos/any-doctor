import { ProjectConsumers } from "./project-consumers.js";
import { FunctionStructure } from "./function-structure.js";
import { AnalysisFile, AnalysisSpans, AnalysisCalls, IdentityValue, Mode, OptionPresence, RecipeDecision, ResourceLifetime, SemanticResult, SourceRange, ValueDisposition, ValuePathValue } from "./contract.js";
import { analysisStatus, analyzeBindings, analyzeSpans, analyzeCalls } from "./analysis.js";
type Analyzer = typeof analyzeBindings;
type SpansAnalyzer = typeof analyzeSpans;
type Status = typeof analysisStatus;
export declare function clearAnalysisCache(): void;
export interface AnalysisRequestBody {
    kind?: unknown;
    file?: unknown;
    root?: unknown;
    sourceDigest?: unknown;
    expression?: unknown;
    query?: unknown;
}
export type AnalysisResponse = {
    project: ProjectConsumers;
} | {
    structures: FunctionStructure[];
} | {
    available: boolean;
    reason?: string;
    provider?: import("./contract.js").SemanticProviderProvenance;
} | {
    file: AnalysisFile;
} | {
    file: AnalysisSpans;
} | {
    file: AnalysisCalls;
} | {
    semantic: SemanticResult<IdentityValue | {
        matches: boolean;
    } | ValuePathValue | ValueDisposition | ResourceLifetime | OptionPresence | RecipeDecision>;
    execution?: {
        modelRequests: number;
        modelCacheHits: number;
    };
    subject?: SourceRange;
} | {
    error: string;
};
export declare function handleAnalysisRequest(req: AnalysisRequestBody, mode: Mode, analyzer?: Analyzer, status?: Status, spansAnalyzer?: SpansAnalyzer, callsAnalyzer?: typeof analyzeCalls): AnalysisResponse;
export {};
