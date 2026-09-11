import { Severity } from "./contract.js";
import { CohortSpec } from "./cohort.js";
import { ScanCapture } from "./scan-capture.js";
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
    headSha: string;
    headDirty: boolean;
    added: DiffFinding[];
    continuing: number;
    noLongerDetected: DiffFinding[];
    contextFallback: number;
    ambiguous: number;
    stale: number;
    lineScoped: number;
    unreadable: number;
    contextUnavailable: number;
    identitySchema: number;
    provenance: {
        head: ScanProvenance;
        base: ScanProvenance;
        comparable: boolean;
    };
}
export declare function runDiff(spec: CohortSpec, baseRef: string, head: ScanCapture): Promise<DiffResult>;
