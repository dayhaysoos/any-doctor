import { ExpectedFinding, ReportGroup, Severity } from "./contract.js";
import { CohortSpec } from "./cohort.js";
export interface AddedFinding {
    doctorId: string;
    rule?: string;
    file: string;
    line: number;
    severity: Severity;
}
export interface DiffResult {
    base: string;
    baseSha: string;
    added: AddedFinding[];
    resolved: ExpectedFinding[];
}
export declare function runDiff(spec: CohortSpec, baseRef: string, headGroups: ReportGroup[]): Promise<DiffResult>;
