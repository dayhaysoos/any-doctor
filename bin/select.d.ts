import { BrokenDoctor } from "./discover.js";
import { TtyEnv } from "./tty.js";
export interface SelectionRow {
    scope: string;
    slug: string;
    description: string;
}
export type Selection = {
    kind: "doctor";
    doctorPath: string;
    skipped: BrokenDoctor[];
    unsafe: string[];
} | {
    kind: "not-found";
    arg: string;
} | {
    kind: "none-discovered";
    broken: BrokenDoctor[];
    unsafe: string[];
} | {
    kind: "non-interactive";
    rows: SelectionRow[];
    skipped: BrokenDoctor[];
    unsafe: string[];
} | {
    kind: "cancelled";
};
export interface SelectOptions {
    cwd: string;
    globalDir?: string;
    bundledDir?: string;
    useColor: boolean;
    allowPicker?: boolean;
    env: TtyEnv;
}
export declare function selectDoctor(doctorArg: string | undefined, options: SelectOptions): Promise<Selection>;
