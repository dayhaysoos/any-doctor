import { Finding, ReportGroup, Severity } from "./contract";
export declare function highlightCode(line: string, useColor: boolean): string;
export interface DashItem {
    key: string;
    checkKey: string;
    doctorId: string;
    checkId: string;
    description: string;
    severity: Severity;
    category: string;
    site: Finding;
    impact?: string;
    why?: string;
    fix?: string;
    blindSpots?: string[];
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
export declare function visibleWidth(s: string): number;
export declare function truncateVisible(s: string, width: number): string;
export interface DashboardLayout {
    mode: "split" | "stacked";
    listWidth: number;
    detailWidth: number;
    listHeight: number;
    detailHeight: number;
}
export declare function resolveDashboardLayout(cols: number, rows: number, itemCount: number): DashboardLayout;
interface ListRow {
    kind: "section" | "item";
    text: string;
    severity: Severity;
    itemIndex: number;
}
export declare function buildListRows(items: DashItem[], useColor: boolean, selected: number, readKeys: Set<string>): ListRow[];
export declare function dashboardFrame(state: {
    items: DashItem[];
    selected: number;
    readKeys: Set<string>;
    root: string;
    fileCount: number;
    durationMs: number;
    useColor: boolean;
    notice?: string;
    cols: number;
    rows: number;
}): string;
export declare function runDashboard(input: DashboardInput): Promise<void>;
export {};
