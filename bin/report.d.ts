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
    lineScoped: number;
    comparable: boolean;
}
export declare function reportDiffOf(diff: DiffResult): ReportDiff;
export interface ReportReview {
    accepted: number;
    notApplicable: number;
    reassessing: {
        checkKey: string;
        file: string;
        reason: string;
    }[];
    ambiguous: {
        checkKey: string;
        file: string;
        occurrences: number;
        reason: string;
    }[];
}
export declare function renderReport(input: RunOutcome, useColor: boolean, diff?: ReportDiff, review?: ReportReview): string;
export interface JsonReview {
    annotations: Map<string, {
        decisionKey?: string;
        decision?: {
            disposition: string;
            reason: string;
            actor: string;
            updatedAt: string;
        };
        stale?: boolean;
    }>;
    reassessing: {
        checkKey: string;
        file: string;
        reason: string;
    }[];
    ambiguous: {
        checkKey: string;
        file: string;
        occurrences: number;
    }[];
    dormant: number;
}
export declare function renderJson(input: RunOutcome, summary: RunSummary, gate: GateVerdict, diff?: DiffResult, review?: JsonReview, broken?: {
    id: string;
    detail: string;
}[]): string;
export declare function renderVerifyResult(result: VerifyRunResult, useColor: boolean): string;
