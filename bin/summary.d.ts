import { Finding, ReportGroup, Severity } from "./contract.js";
import { RunOutcome } from "./report.js";
import { ScoreHeader, ScoreResult } from "./score.js";
export declare function dedupeGroups(groups: ReportGroup[]): {
    groups: ReportGroup[];
    hidden: number;
};
export interface CheckBucket {
    ruleId: string | null;
    heading: string;
    severity: Severity;
    findings: Finding[];
}
export interface GroupChecks {
    group: ReportGroup;
    checks: CheckBucket[];
    narrowedIds: string[];
}
export interface RunSummary {
    groups: ReportGroup[];
    groupChecks: GroupChecks[];
    total: number;
    hidden: number;
    score: ScoreResult;
    header: ScoreHeader;
    severityCounts: Record<Severity, number>;
    categories: {
        category: string;
        counts: Record<Severity, number>;
    }[];
    emptyScan: boolean;
}
export declare function deriveSummary(outcome: RunOutcome): RunSummary;
