import { RunOutcome, VerifyRunResult } from "./contract.js";
import { RunSummary } from "./summary.js";
import type { DiffResult } from "./diff.js";
import type { GateVerdict } from "./gate.js";
export declare function unsafeSkipLine(names: string[]): string;
export declare function emptyScanLine(): string;
export declare function unsafeRefusalLine(name: string, capabilities: readonly string[]): string;
export interface ReportDiff {
    base: string;
    added: number;
    continuing: number;
    noLongerDetected: number;
    contextFallback: number;
    ambiguous: number;
    stale: number;
    comparable: boolean;
}
export declare function reportDiffOf(diff: DiffResult): ReportDiff;
export declare function renderReport(input: RunOutcome, useColor: boolean, diff?: ReportDiff): string;
export declare function renderJson(input: RunOutcome, summary: RunSummary, gate: GateVerdict, diff?: DiffResult): string;
export declare function renderVerifyResult(result: VerifyRunResult, useColor: boolean): string;
