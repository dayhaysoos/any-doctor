import type { ProjectConsumers } from "./project-consumers.js";
import { DoctorCtx, DoctorMeta, Finding, SemanticRunReport } from "./contract.js";
export declare function setAnalysisDisabled(disabled: boolean): void;
export declare function probeAnalysisAvailable(root: string): boolean;
export declare function buildCtx(root: string, opts?: {
    includeTests?: boolean;
}): {
    ctx: DoctorCtx;
    getFindings(): Finding[];
    getAnalysisCoverage(): ProjectConsumers["coverage"] | undefined;
    getSemanticReport(meta: DoctorMeta): SemanticRunReport | undefined;
};
