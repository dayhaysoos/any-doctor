import { Finding, ReportGroup, RunOutcome, Severity } from "./contract.js";
import { ScoreHeader, ScoreResult } from "./score.js";
export interface CheckBucket {
    ruleId: string | null;
    heading: string;
    severity: Severity;
    impact?: string;
    why?: string;
    fix?: string;
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
