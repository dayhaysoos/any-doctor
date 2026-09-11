export declare function encodeDecisionKey(raw: string): string;
export declare function decodeDecisionKey(encoded: string): string | null;
export declare const DECISIONS_SCHEMA = 1;
export type Disposition = "accepted" | "not-applicable";
export interface DecisionRecord {
    key: string;
    checkKey: string;
    file: string;
    line: number;
    disposition: Disposition;
    reason: string;
    scope: "local";
    actor: string;
    createdAt: string;
    updatedAt: string;
    provenance?: {
        revision?: number;
        programDigest?: string;
    };
}
export interface DecisionsFile {
    schema: number;
    decisions: DecisionRecord[];
}
export declare function decisionsPath(targetDir: string): string;
export type DecisionsResult = {
    ok: true;
    decisions: DecisionRecord[];
} | {
    ok: false;
    error: string;
};
export type DecisionsReader = (p: string) => {
    ok: true;
    text: string;
} | {
    ok: false;
    code: "absent" | "unreadable";
    error?: string;
};
export declare function readDecisionsFile(p: string): ReturnType<DecisionsReader>;
export declare function loadDecisions(targetDir: string, readFile?: DecisionsReader): DecisionsResult;
export declare function saveDecisions(targetDir: string, decisions: DecisionRecord[], readFile?: DecisionsReader, writeFile?: (p: string, text: string) => void, mergeWithDisk?: boolean): void;
export interface RecordInput {
    key: string;
    checkKey: string;
    file: string;
    line: number;
    disposition: Disposition;
    reason: string;
    actor: string;
    now?: Date;
    provenance?: {
        revision?: number;
        programDigest?: string;
    };
}
export declare function recordDecision(targetDir: string, input: RecordInput): DecisionsResult & {
    record?: DecisionRecord;
};
export declare function reverseDecision(targetDir: string, key: string): DecisionsResult;
export interface AppliedDecisions {
    byKey: Map<string, DecisionRecord>;
    reassessing: {
        decision: DecisionRecord;
        currentKeys: string[];
    }[];
    ambiguous: {
        decision: DecisionRecord;
        occurrences: number;
    }[];
    dormant: DecisionRecord[];
}
export interface OccurrenceKeys {
    keys: {
        key: string;
        checkKey: string;
        file: string;
        line: number;
    }[];
    presentPairs: Set<string>;
}
export declare function applyDecisions(decisions: DecisionRecord[], occ: OccurrenceKeys): AppliedDecisions;
