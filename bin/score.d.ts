import { Finding, ReportGroup, Severity } from "./contract.js";
export interface ScoreResult {
    score: number;
    grade: string;
}
export declare function findingSeverity(g: ReportGroup, f: Finding): Severity;
export declare function scoreFromSeverities(sevs: Severity[]): ScoreResult;
export declare function computeScore(groups: ReportGroup[]): ScoreResult;
export declare function categoryRollup(groups: ReportGroup[]): {
    category: string;
    counts: Record<Severity, number>;
}[];
