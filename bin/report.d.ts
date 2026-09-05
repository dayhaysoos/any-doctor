import { ReportGroup, VerifyRunResult } from "./contract.js";
export interface ReportInput {
    fileCount: number;
    durationMs: number;
    groups: ReportGroup[];
}
export declare function dedupeGroups(groups: ReportGroup[]): {
    groups: ReportGroup[];
    hidden: number;
};
export declare function renderReport(input: ReportInput, useColor: boolean): string;
export declare function renderVerifyResult(result: VerifyRunResult, useColor: boolean): string;
