import { Finding, ReportGroup, Severity } from "./contract.js";
export interface ScoreResult {
    score: number;
    grade: string;
    filesClean: number;
    filesTotal: number;
}
export declare function findingSeverity(g: ReportGroup, f: Finding): Severity;
export declare function gradeFor(score: number): string;
export declare function scoreFromFileHealth(perFile: {
    file: string;
    severity: Severity;
}[], filesTotal: number): ScoreResult;
export declare function computeScore(groups: ReportGroup[], filesTotal: number): ScoreResult;
export declare function categoryRollup(groups: ReportGroup[]): {
    category: string;
    counts: Record<Severity, number>;
}[];
