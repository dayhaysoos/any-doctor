import { Cause, Schema } from "effect";
import { DoctorMeta, RunResult, VerifyRunResult } from "./contract.js";
declare const ProgramMissing_base: Schema.Class<ProgramMissing, Schema.TaggedStruct<"ProgramMissing", {
    readonly programPath: Schema.String;
}>, Cause.YieldableError>;
export declare class ProgramMissing extends ProgramMissing_base {
}
declare const FixturesMissing_base: Schema.Class<FixturesMissing, Schema.TaggedStruct<"FixturesMissing", {
    readonly programPath: Schema.String;
    readonly fixturesPath: Schema.String;
}>, Cause.YieldableError>;
export declare class FixturesMissing extends FixturesMissing_base {
}
declare const DoctorCrashed_base: Schema.Class<DoctorCrashed, Schema.TaggedStruct<"DoctorCrashed", {
    readonly programPath: Schema.String;
    readonly detail: Schema.String;
}>, Cause.YieldableError>;
export declare class DoctorCrashed extends DoctorCrashed_base {
}
declare const NoFramedResult_base: Schema.Class<NoFramedResult, Schema.TaggedStruct<"NoFramedResult", {
    readonly programPath: Schema.String;
    readonly stdout: Schema.String;
}>, Cause.YieldableError>;
export declare class NoFramedResult extends NoFramedResult_base {
}
declare const DoctorUnsafe_base: Schema.Class<DoctorUnsafe, Schema.TaggedStruct<"DoctorUnsafe", {
    readonly programPath: Schema.String;
    readonly capabilities: Schema.$Array<Schema.String>;
    readonly findings: Schema.$Array<Schema.String>;
}>, Cause.YieldableError>;
export declare class DoctorUnsafe extends DoctorUnsafe_base {
}
export type RunnerError = ProgramMissing | FixturesMissing | DoctorCrashed | NoFramedResult | DoctorUnsafe;
export declare function isRunnerError(e: unknown): e is RunnerError;
export declare function describeRunnerError(e: RunnerError): string;
export declare function causeSummaryLine(e: RunnerError | undefined): string;
export interface RunOptions {
    programPath: string;
    targetDir: string;
    /** List test files too; the default excludes them (tests are not production reads). */
    includeTests?: boolean;
}
export interface VerifyOptions {
    programPath: string;
    fixturesPath?: string;
}
export interface MetaRead {
    meta: DoctorMeta | null;
    cause?: RunnerError;
}
export declare function supportsPermissionModel(): Promise<boolean>;
export declare function permissionArgs(allowTmpWrites: boolean): Promise<string[]>;
export declare function deniedByPermissionModel(stderr: string): boolean;
export declare function denialCapability(stderr: string): string;
export declare function runDoctor(options: RunOptions): Promise<RunResult>;
export declare const DOCTOR_POOL_SIZE = 4;
export type CohortRun = {
    ok: true;
    options: RunOptions;
    result: RunResult;
} | {
    ok: false;
    options: RunOptions;
    cause: RunnerError;
};
export interface CohortProgress {
    index: number;
    total: number;
    programPath: string;
    ok: boolean;
    durationMs: number;
}
export declare function runDoctorCohort(options: RunOptions[], onProgress?: (p: CohortProgress) => void): Promise<CohortRun[]>;
export declare function verifyDoctor(options: VerifyOptions): Promise<VerifyRunResult>;
export declare function metaDoctor({ programPath }: {
    programPath: string;
}): Promise<MetaRead>;
export {};
