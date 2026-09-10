import { RunOutcome } from "./contract.js";
import { CohortProgress } from "./runner.js";
export interface CohortDoctor {
    id: string;
    programPath: string;
}
export interface CohortSpec {
    doctors: readonly CohortDoctor[];
    targetDir: string;
    includeTests: boolean;
    skippedUnsafe?: readonly string[];
}
export declare function runCohort(spec: CohortSpec, onProgress?: (p: CohortProgress) => void): Promise<RunOutcome>;
