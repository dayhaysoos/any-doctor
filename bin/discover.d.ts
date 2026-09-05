import { DoctorMeta } from "./contract.js";
export type Scope = "repo" | "global";
export interface DiscoveredDoctor {
    slug: string;
    scope: Scope;
    path: string;
    meta: DoctorMeta | null;
    error?: string;
}
export declare function globalDoctorsDir(): string;
export declare function findRepoDoctorsDir(cwd: string): string | null;
export declare function discoverDoctors(cwd: string, opts?: {
    globalDir?: string;
}): Promise<DiscoveredDoctor[]>;
export declare function resolveDoctorPath(arg: string, cwd: string): string | null;
