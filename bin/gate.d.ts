import { Severity } from "./contract.js";
export type FailOn = "none" | "error" | "warning" | "info";
export declare function isFailOn(v: string): v is FailOn;
export interface GateCounts {
    error: number;
    warning: number;
    info: number;
}
export interface GateVerdict {
    fails: boolean;
    reason: string | null;
    failOn: FailOn;
    mode: "full" | "diff";
}
export declare function gateVerdict(failOn: FailOn, counts: GateCounts, mode: "full" | "diff"): GateVerdict;
export declare function countsOfSeverities(severities: Severity[]): GateCounts;
