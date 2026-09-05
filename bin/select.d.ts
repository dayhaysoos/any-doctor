import { TtyStdin, TtyStdout } from "./tty.js";
export interface BrokenDoctor {
    slug: string;
    error?: string;
}
export interface SelectionRow {
    scope: string;
    slug: string;
    description: string;
    count?: number | "error";
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
    stdin: TtyStdin;
    stdout: TtyStdout;
}
export declare function selectDoctor(doctorArg: string | undefined, options: SelectOptions): Promise<Selection>;
