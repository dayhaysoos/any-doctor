import { ReportGroup, VerifyRunResult } from "./contract.js";
export interface RunOutcome {
    groups: ReportGroup[];
    crashed: string[];
    skippedUnsafe: string[];
    doctorPaths: ReadonlyMap<string, string>;
    fileCount: number;
    durationMs: number;
    targetDir: string;
}
export declare function cohortFileCount(counts: number[]): number;
export declare function unsafeSkipLine(names: string[]): string;
export declare function unsafeRefusalLine(name: string, capabilities: readonly string[]): string;
export declare function dedupeGroups(groups: ReportGroup[]): {
    groups: ReportGroup[];
    hidden: number;
};
export declare function renderReport(input: RunOutcome, useColor: boolean): string;
export declare function renderVerifyResult(result: VerifyRunResult, useColor: boolean): string;
