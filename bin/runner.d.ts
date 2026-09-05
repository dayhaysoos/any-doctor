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
export type RunnerError = ProgramMissing | FixturesMissing | DoctorCrashed | NoFramedResult;
export declare function isRunnerError(e: unknown): e is RunnerError;
export declare function describeRunnerError(e: RunnerError): string;
export interface RunOptions {
    programPath: string;
    targetDir: string;
}
export interface VerifyOptions {
    programPath: string;
    fixturesPath?: string;
}
export interface MetaRead {
    meta: DoctorMeta | null;
    error?: string;
}
export declare function fixturesPathFor(programPath: string): string;
export declare function runDoctor(options: RunOptions): Promise<RunResult>;
export declare function verifyDoctor(options: VerifyOptions): Promise<VerifyRunResult>;
export type CountResult = {
    programPath: string;
    count: number;
} | {
    programPath: string;
    error: RunnerError;
};
export declare function countAll({ programPaths, targetDir }: {
    programPaths: string[];
    targetDir: string;
}): Promise<CountResult[]>;
export declare function metaDoctor({ programPath }: {
    programPath: string;
}): Promise<MetaRead>;
export {};
