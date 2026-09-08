import { DoctorMeta } from "./contract.js";
import { RunnerError } from "./runner.js";
export type Scope = "repo" | "global" | "bundled";
export interface DiscoveredDoctor {
    slug: string;
    scope: Scope;
    path: string;
    meta: DoctorMeta | null;
    cause?: RunnerError;
}
export interface BrokenDoctor {
    slug: string;
    cause?: RunnerError;
}
export declare function unsafeSlugs(discovered: DiscoveredDoctor[]): string[];
export declare function brokenDoctors(discovered: DiscoveredDoctor[]): BrokenDoctor[];
export declare function globalDoctorsDir(): string;
export declare function bundledDoctorsDir(): string;
export declare function findRepoDoctorsDir(cwd: string): string | null;
export declare function discoverDoctors(cwd: string, opts?: {
    globalDir?: string;
    bundledDir?: string;
}): Promise<DiscoveredDoctor[]>;
export declare function resolveDoctorPath(arg: string, cwd: string, opts?: {
    globalDir?: string;
    bundledDir?: string;
}): string | null;
