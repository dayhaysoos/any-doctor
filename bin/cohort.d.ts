import { RunOutcome } from "./contract.js";
import { CohortProgress, runDoctorCohort } from "./runner.js";
export interface CohortDoctor {
    id: string;
    programPath: string;
}
export interface CohortSpec {
    doctors: readonly CohortDoctor[];
    targetDir: string;
    includeTests: boolean;
    skippedUnsafe?: readonly string[];
    broken?: readonly {
        slug: string;
        cause?: {
            _tag?: string;
        };
    }[];
}
export type DoctorExecutor = typeof runDoctorCohort;
export declare function runCohort(spec: CohortSpec, onProgress?: (p: CohortProgress) => void, exec?: DoctorExecutor): Promise<RunOutcome>;
