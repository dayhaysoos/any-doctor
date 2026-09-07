import { DoctorCtx, Finding } from "./contract.js";
export declare function buildCtx(root: string, opts?: {
    includeTests?: boolean;
}): {
    ctx: DoctorCtx;
    getFindings(): Finding[];
};
