import { Finding, ReportGroup, Severity } from "./contract";
export interface DashItem {
    key: string;
    doctorId: string;
    checkId: string;
    description: string;
    severity: Severity;
    category: string;
    sites: Finding[];
    impact?: string;
    why?: string;
    fix?: string;
    blindSpots?: string[];
    doctorFile: string;
}
export interface DashboardInput {
    root: string;
    groups: ReportGroup[];
    doctorFile: string;
    fileCount: number;
    durationMs: number;
    useColor: boolean;
}
export declare function scoreBar(score: number, width: number): string;
export declare function buildItems(groups: ReportGroup[], doctorFile: string): DashItem[];
export declare function issuePrompt(item: DashItem, verifyCommand: string): string;
export interface DashSection {
    title: string;
    itemIndexes: number[];
}
export declare function buildSections(items: DashItem[]): DashSection[];
export declare function dashboardFrame(opts: {
    items: DashItem[];
    sections: DashSection[];
    selected: number;
    readKeys: Set<string>;
    query: string;
    cols: number;
    rows: number;
    root: string;
    fileCount: number;
    durationMs: number;
    useColor: boolean;
    notice?: string;
}): string;
export declare function runDashboard(input: DashboardInput): Promise<void>;
