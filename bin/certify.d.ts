import { buildCtx } from "./sdk.js";
import type { Fixture, FixtureResult, RunResult } from "./contract.js";
export interface DoctorModule {
    meta?: unknown;
    doctor?: (ctx: ReturnType<typeof buildCtx>["ctx"]) => unknown;
}
export declare function runOnce(root: string, mod: DoctorModule, opts: {
    includeTests: boolean;
}): Promise<RunResult>;
export declare class ClaimContractViolation extends Error {
    readonly problems: string[];
    constructor(problems: string[]);
}
export declare function validateClaimContract(mod: DoctorModule): void;
export declare function certify(mod: DoctorModule, fixtures: Fixture[]): Promise<FixtureResult[]>;
