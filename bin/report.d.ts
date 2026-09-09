import { ReportGroup, VerifyRunResult } from "./contract.js";
export interface CrashedDoctor {
    id: string;
    detail: string;
}
export interface RunOutcome {
    groups: ReportGroup[];
    crashed: CrashedDoctor[];
    skippedUnsafe: string[];
    doctorPaths: ReadonlyMap<string, string>;
    fileCount: number;
    durationMs: number;
    targetDir: string;
    /** Could the identity engine power this run? (D20 Stage 2) — checks
     * that declared `needs` render "narrowed" when false. */
    analysisAvailable?: boolean;
}
export declare function cohortFileCount(counts: number[]): number;
export declare function unsafeSkipLine(names: string[]): string;
export declare function emptyScanLine(): string;
export declare function unsafeRefusalLine(name: string, capabilities: readonly string[]): string;
export declare function dedupeGroups(groups: ReportGroup[]): {
    groups: ReportGroup[];
    hidden: number;
};
export declare function renderReport(input: RunOutcome, useColor: boolean): string;
export declare function renderVerifyResult(result: VerifyRunResult, useColor: boolean): string;
