import { ReportGroup, Severity } from "./contract.js";
import { CohortSpec } from "./cohort.js";
import { ScanProvenance } from "./identity.js";
export interface DiffFinding {
    doctorId: string;
    rule?: string;
    file: string;
    line: number;
    column?: number;
    severity: Severity;
}
export interface DiffResult {
    base: string;
    baseSha: string;
    added: DiffFinding[];
    continuing: number;
    noLongerDetected: DiffFinding[];
    contextFallback: number;
    ambiguous: number;
    stale: number;
    identitySchema: number;
    provenance: {
        head: ScanProvenance;
        base: ScanProvenance;
        comparable: boolean;
    };
}
export declare function runDiff(spec: CohortSpec, baseRef: string, headGroups: ReportGroup[], headAnalysisAvailable?: boolean): Promise<DiffResult>;
