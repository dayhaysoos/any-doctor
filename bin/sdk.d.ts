import { DoctorCtx, Finding } from "./contract.js";
export declare function buildCtx(root: string): {
    ctx: DoctorCtx;
    getFindings(): Finding[];
};
