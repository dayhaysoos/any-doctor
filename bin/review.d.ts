import { DecisionRecord, Disposition } from "./finding-state.js";
import type { ScanCapture } from "./scan-capture.js";
export interface ReviewRow {
    key?: string;
    decision?: {
        disposition: Disposition;
        reason: string;
        actor: string;
        updatedAt: string;
    };
    ambiguous?: number;
    stale?: boolean;
}
export interface ReviewView {
    rows: Map<string, ReviewRow>;
    suppressedReadKeys: Set<string>;
    suppressedIdentityKeys: Set<string>;
    rawKeyByReadKey: Map<string, string>;
    accepted: number;
    notApplicable: number;
    reassessing: {
        checkKey: string;
        file: string;
        reason: string;
    }[];
    ambiguous: {
        checkKey: string;
        file: string;
        occurrences: number;
        reason: string;
    }[];
    dormant: number;
    decisions: DecisionRecord[];
    provenance: ScanProvenance;
}
export interface ScanProvenance {
    revisions: Map<string, number>;
    programDigests: Map<string, string>;
}
export declare const emptyProvenance: () => ScanProvenance;
export declare function provenanceCompatible(recorded: {
    revision?: number;
    programDigest?: string;
} | undefined, scan: ScanProvenance, checkKey: string): boolean;
export declare function reviewOf(capture: ScanCapture, decisions: DecisionRecord[], encodeKey: (raw: string) => string, provenance?: ScanProvenance): ReviewView;
export declare function withDecision(view: ReviewView, record: DecisionRecord, encodeKey: (raw: string) => string, capture: ScanCapture, provenance?: ScanProvenance): ReviewView;
export declare function withoutDecision(view: ReviewView, key: string, encodeKey: (raw: string) => string, capture: ScanCapture, provenance?: ScanProvenance): ReviewView;
