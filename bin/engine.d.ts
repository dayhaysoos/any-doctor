import { RuleQuery } from "./contract.js";
export type EngineQuery = {
    op: "pattern";
    pattern: string;
} | {
    op: "rule";
    rule: RuleQuery;
};
export interface RawSgMatch {
    file?: string;
    text?: string;
    lines?: string;
    language?: string;
    range?: {
        start?: {
            line?: number;
            column?: number;
        };
        end?: {
            line?: number;
            column?: number;
        };
    };
    metaVariables?: {
        single?: Record<string, RawSgCapture>;
        multi?: Record<string, RawSgCapture[]>;
    };
}
export interface RawSgCapture {
    text?: string;
    range?: {
        start?: {
            line?: number;
            column?: number;
        };
        end?: {
            line?: number;
            column?: number;
        };
    };
}
export type EngineResult = {
    ok: true;
    matches: RawSgMatch[];
} | {
    ok: false;
    error: string;
};
export declare function runEngine(query: EngineQuery, language: string, root: string): EngineResult;
