import { DoctorCtx, Finding } from "./contract.js";
export declare const DEFAULT_EXTS: string[];
export declare function setAnalysisDisabled(disabled: boolean): void;
export declare function probeAnalysisAvailable(root: string): boolean;
export declare function buildCtx(root: string, opts?: {
    includeTests?: boolean;
}): {
    ctx: DoctorCtx;
    getFindings(): Finding[];
};
