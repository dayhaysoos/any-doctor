import { ReportGroup, Severity } from "./contract.js";
import { CohortSpec } from "./cohort.js";
import { DoctorDigest, EvidenceReport, ScanProvenance } from "./identity.js";
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
export interface HeadScanCapture {
    groups: ReportGroup[];
    analysisAvailable: boolean;
    digests: DoctorDigest[];
    evidence: EvidenceReport;
    sources: Map<string, string>;
}
export declare function captureHeadScan(targetDir: string, headGroups: ReportGroup[], analysisAvailable: boolean, digests: DoctorDigest[]): HeadScanCapture;
export declare function runDiff(spec: CohortSpec, baseRef: string, head: HeadScanCapture): Promise<DiffResult>;
