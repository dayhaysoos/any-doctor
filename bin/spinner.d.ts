import type { TtyStdout } from "./tty.js";
export interface SpinnerState {
    label: string;
    done: number;
    total: number;
    elapsedMs: number;
    note?: string;
}
export declare function spinnerLine(tick: number, s: SpinnerState): string;
export declare function formatMs(ms: number): string;
export interface SpinnerHandle {
    update(state: Partial<Omit<SpinnerState, "label" | "elapsedMs">>): void;
    stop(): void;
}
export declare function startSpinner(stdout: TtyStdout, initial: {
    label: string;
    total: number;
}, opts?: {
    delayMs?: number;
    now?: () => number;
}): SpinnerHandle;
