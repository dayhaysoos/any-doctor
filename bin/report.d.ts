import { DoctorMeta, Finding } from "./contract";
export interface ReportGroup {
    programName: string;
    meta: DoctorMeta;
    findings: Finding[];
}
export interface ReportInput {
    fileCount: number;
    durationMs: number;
    groups: ReportGroup[];
}
export declare function renderReport(input: ReportInput, useColor: boolean): string;
