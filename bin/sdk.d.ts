import { DoctorCtx, Finding } from "./contract";
export declare function buildCtx(root: string): {
    ctx: DoctorCtx;
    getFindings(): Finding[];
};
