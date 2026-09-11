import { SpanInfo } from "./contract.js";
export declare const IDENTITY_SCHEMA_VERSION = 1;
export interface OccurrenceEvidence {
    checkKey: string;
    file: string;
    line: number;
    column?: number;
    lineDigest: string | null;
    relColumn: number | null;
    contextId: string | null;
    scope: "range" | "line";
}
export interface EvidenceInput {
    checkKey: string;
    file: string;
    line: number;
    column?: number;
    evidence?: {
        endLine: number;
        endColumn?: number;
    };
}
export interface EvidenceReport {
    occurrences: OccurrenceEvidence[];
    unreadableFiles: string[];
    contextUnavailableFiles: string[];
}
export interface DoctorDigest {
    doctorId: string;
    digest: string;
}
export declare function doctorDigests(doctors: readonly {
    id: string;
    programPath: string;
}[], readProgram: (programPath: string) => string | null): DoctorDigest[];
export declare function digestTextFile(programPath: string): string | null;
export interface ScanProvenance {
    schema: number;
    doctors: DoctorDigest[];
    analysisAvailable: boolean;
}
export declare function scanProvenance(doctors: readonly {
    id: string;
    programPath: string;
}[], analysisAvailable: boolean, digests: DoctorDigest[]): ScanProvenance;
export declare function comparableScans(base: ScanProvenance, head: ScanProvenance): boolean;
export declare function extractEvidence(findings: EvidenceInput[], readSource: (file: string) => string | null, spansFor: (file: string, source: string) => SpanInfo[] | null): EvidenceReport;
export interface MatchedPair {
    baseIndex: number;
    headIndex: number;
    contextFallback: boolean;
}
export interface ScanComparison {
    pairs: MatchedPair[];
    addedIndices: number[];
    absentIndices: number[];
    ambiguous: number;
    stale: number;
    lineScoped: number;
}
export declare function compareOccurrences(base: OccurrenceEvidence[], head: OccurrenceEvidence[]): ScanComparison;
export declare function spansProvider(engineOn: boolean): (file: string, source: string) => SpanInfo[] | null;
export declare function analysisEngineAvailable(): boolean;
