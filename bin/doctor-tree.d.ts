import { Finding, JoinedFinding, ReportGroup, Severity } from "./contract.js";
import { ScoreResult } from "./score.js";
export type SiteFinding = {
    readKey: string;
    site: Finding;
} & Omit<JoinedFinding, "finding">;
export declare function buildItems(groups: ReportGroup[]): SiteFinding[];
export interface DoctorSummary {
    doctorId: string;
    description: string;
    worst: Severity;
    count: number;
    files: number;
    score: ScoreResult;
    checks: {
        description: string;
        severity: Severity;
        count: number;
    }[];
    blindSpots?: string[];
}
export interface CheckSummary {
    checkKey: string;
    checkId: string;
    doctorId: string;
    description: string;
    severity: Severity;
    impact?: string;
    why?: string;
    fix?: string;
    blindSpots?: string[];
    count: number;
    files: number;
}
export interface DoctorGroup {
    doctorId: string;
    checks: {
        checkKey: string;
        items: SiteFinding[];
    }[];
    multiCheck: boolean;
    count: number;
    worst: Severity;
    score: ScoreResult;
}
export type DoctorTree = DoctorGroup[];
export declare const FINDINGS_PER_CHECK = 50;
export declare function buildTree(items: SiteFinding[], filesTotal: number): DoctorTree;
export declare function summarizeCheck(checkKey: string, groupItems: SiteFinding[]): CheckSummary;
export declare function summarizeDoctor(d: DoctorGroup): DoctorSummary;
export declare function initialExpanded(tree: DoctorTree): Set<string>;
