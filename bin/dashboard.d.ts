import { Finding, JoinedFinding, ReportGroup, Severity } from "./contract.js";
import { truncateVisible, TtyStdin, TtyStdout, visibleWidth } from "./tty.js";
export { truncateVisible, visibleWidth };
export declare function highlightCode(line: string, useColor: boolean): string;
export type DashItem = {
    key: string;
    site: Finding;
} & Omit<JoinedFinding, "finding">;
export interface DashboardInput {
    root: string;
    groups: ReportGroup[];
    doctorFile: string;
    doctorFileFor?: (doctorId: string) => string;
    invoker?: string;
    verifyCommand?: string;
    fileCount: number;
    durationMs: number;
    useColor: boolean;
}
export declare function scoreBar(score: number, width: number): string;
export declare function buildItems(groups: ReportGroup[]): DashItem[];
export declare function issuePrompt(item: DashItem, verifyCommand: string): string;
export interface DashboardLayout {
    mode: "split" | "stacked";
    listWidth: number;
    detailWidth: number;
    listHeight: number;
    detailHeight: number;
    bodyRows: number;
}
export declare function resolveDashboardLayout(cols: number, rows: number, itemCount: number): DashboardLayout;
export type RowKind = "section" | "check" | "item" | "more";
export interface DoctorSummary {
    doctorId: string;
    description: string;
    worst: Severity;
    count: number;
    files: number;
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
interface ListRow {
    kind: RowKind;
    text: string;
    severity: Severity;
    selectable: boolean;
    itemIndex: number;
    check?: CheckSummary;
    doctor?: DoctorSummary;
}
export declare const INSTANCES_PER_CHECK = 50;
export declare function initialExpanded(items: DashItem[]): Set<string>;
export declare function buildListRows(items: DashItem[], useColor: boolean, selectedRow: number, readKeys: Set<string>, expanded?: ReadonlySet<string>): ListRow[];
export interface FrameSource {
    (file: string): string[] | null;
}
export declare function dashboardFrame(state: {
    items: DashItem[];
    selected: number;
    readKeys: Set<string>;
    readSource: FrameSource;
    expanded?: ReadonlySet<string>;
    fileCount: number;
    durationMs: number;
    useColor: boolean;
    notice?: string;
    cols: number;
    rows: number;
}): string;
export type DashboardStdin = TtyStdin;
export type DashboardStdout = TtyStdout;
export declare function runDashboard(input: DashboardInput): Promise<void>;
export interface DashboardDeps {
    copy?: (text: string) => boolean;
}
export declare function runDashboardOn(env: {
    stdin: DashboardStdin;
    stdout: DashboardStdout;
}, input: DashboardInput, deps?: DashboardDeps): Promise<void>;
