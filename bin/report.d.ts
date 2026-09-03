import { ReportGroup } from "./contract";
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
