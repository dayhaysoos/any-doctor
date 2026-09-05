export interface TtyEnv {
    stdin: TtyStdin;
    stdout: TtyStdout;
}
export declare function processTtyEnv(): TtyEnv;
export declare function canRunTui(env: {
    stdin: {
        readonly isTTY?: boolean;
    };
    stdout: {
        readonly isTTY?: boolean;
    };
}): boolean;
export interface TtyStdin {
    readonly isTTY?: boolean;
    readonly isRaw?: boolean;
    setRawMode(mode: boolean): unknown;
    resume(): unknown;
    pause(): unknown;
    on(event: "data", listener: (chunk: string | Buffer) => void): unknown;
    removeListener(event: "data", listener: (chunk: string | Buffer) => void): unknown;
}
export interface TtyStdout {
    readonly isTTY?: boolean;
    columns?: number;
    rows?: number;
    write(s: string): unknown;
}
export declare function visibleWidth(s: string): number;
export declare function truncateVisible(s: string, width: number): string;
export declare function paintFrame(stdout: TtyStdout, frame: string, cols: number): void;
export interface RunTtyOptions<T> {
    stdin: TtyStdin;
    stdout: TtyStdout;
    frame: () => string;
    onKey: (key: string, finish: (result: T) => void) => void;
}
export declare function runTty<T>(options: RunTtyOptions<T>): Promise<T>;
