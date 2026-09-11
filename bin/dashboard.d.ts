import { Severity } from "./contract.js";
import { CheckSummary, DoctorSummary, DoctorTree, SiteFinding } from "./doctor-tree.js";
import { TtyStdin, TtyStdout } from "./tty.js";
import { RunOutcome } from "./contract.js";
export declare function highlightCode(line: string, useColor: boolean): string;
export interface DashboardInput {
    outcome: RunOutcome;
    invoker?: string;
    useColor: boolean;
}
export declare function scoreBar(score: number, width: number): string;
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
interface ListRow {
    kind: RowKind;
    text: string;
    severity: Severity;
    selectable: boolean;
    item?: SiteFinding;
    check?: CheckSummary;
    doctor?: DoctorSummary;
    toggleKey?: string;
}
export declare function buildListRows(tree: DoctorTree, useColor: boolean, selectedRow: number, readKeys: Set<string>, expanded?: ReadonlySet<string>): ListRow[];
export interface FrameSource {
    (file: string): string[] | null;
}
export interface DashboardFrameState {
    tree: DoctorTree;
    selectedRow: number;
    readKeys: Set<string>;
    readSource: FrameSource;
    expanded?: ReadonlySet<string>;
    filesTotal: number;
    durationMs: number;
    useColor: boolean;
    notice?: string;
    skippedUnsafe?: string[];
    cols: number;
    rows: number;
}
export declare function dashboardFrame(state: DashboardFrameState): string;
export declare function runDashboard(input: DashboardInput): Promise<void>;
export interface DashboardDeps {
    copy?: (text: string) => boolean;
}
export declare function runDashboardOn(env: {
    stdin: TtyStdin;
    stdout: TtyStdout;
}, input: DashboardInput, deps?: DashboardDeps): Promise<void>;
export {};
