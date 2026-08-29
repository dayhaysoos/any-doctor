import { Finding, Severity } from "./contract";
export interface ReportInput {
    programName: string;
    description: string;
    severity: Severity;
    blindSpots?: string[];
    fileCount: number;
    durationMs: number;
    findings: Finding[];
}
export declare function renderReport(input: ReportInput, useColor: boolean): string;
