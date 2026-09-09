import { Severity } from "./contract.js";
export declare const RED = "\u001B[31m", GREEN = "\u001B[32m", YELLOW = "\u001B[33m", CYAN = "\u001B[36m", ORANGE = "\u001B[38;5;208m", DIM = "\u001B[2m", BOLD = "\u001B[1m", RESET = "\u001B[0m";
export declare const GLYPH: Record<Severity, string>;
export declare const SEVERITY_COLOR: Record<Severity, string>;
export type Colorizer = (s: string, wrap?: string) => string;
export declare function colorizer(useColor: boolean): Colorizer;
export declare function gradeColor(score: number): string;
export declare function scoreHeaderTone(header: {
    emptyScan: boolean;
}, score: number): string;
