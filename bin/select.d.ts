import { TtyEnv } from "./tty.js";
export interface BrokenDoctor {
    slug: string;
    error?: string;
}
export type FindingCount = {
    status: "counted";
    count: number;
} | {
    status: "failed";
};
export interface SelectionRow {
    scope: string;
    slug: string;
    description: string;
    count?: FindingCount;
}
export type Selection = {
    kind: "doctor";
    doctorPath: string;
    skipped: BrokenDoctor[];
} | {
    kind: "not-found";
    arg: string;
} | {
    kind: "none-discovered";
    broken: BrokenDoctor[];
} | {
    kind: "non-interactive";
    rows: SelectionRow[];
    skipped: BrokenDoctor[];
} | {
    kind: "cancelled";
};
export interface SelectOptions {
    cwd: string;
    targetDir?: string;
    globalDir?: string;
    useColor: boolean;
    allowPicker?: boolean;
    env: TtyEnv;
}
export declare function selectDoctor(doctorArg: string | undefined, options: SelectOptions): Promise<Selection>;
