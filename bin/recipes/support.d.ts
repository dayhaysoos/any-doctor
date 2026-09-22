import type { ExpectedFinding, IdentityQuery } from "../contract.js";
import type { ChallengeFixture } from "./types.js";
export declare function occurrence(source: string, rule: string, needle: string, nth?: number, file?: string): ExpectedFinding;
export declare function profile(name: string, source: string, expected: ExpectedFinding[], semantic: "complete" | "narrowed" | "unavailable"): ChallengeFixture;
export declare function profileAt(file: string, name: string, source: string, expected: ExpectedFinding[], semantic: "complete" | "narrowed" | "unavailable"): ChallengeFixture;
export interface IdentityFixture {
    label: string;
    head: string;
    callee: string;
    shadow: string;
}
export declare function identityFixtures(query: IdentityQuery, alias: string): IdentityFixture[];
