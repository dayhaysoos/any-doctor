import { NamedRuleQuery, RuleQuery } from "./contract.js";
export type EngineQuery = {
    op: "pattern";
    pattern: string;
} | {
    op: "rule";
    rule: RuleQuery;
} | {
    op: "rules";
    rules: NamedRuleQuery[];
};
interface RawSgPos {
    line?: number;
    column?: number;
}
interface RawSgRange {
    start?: RawSgPos;
    end?: RawSgPos;
}
export interface RawSgMatch {
    file?: string;
    text?: string;
    lines?: string;
    language?: string;
    ruleId?: string;
    range?: RawSgRange;
    metaVariables?: {
        single?: Record<string, RawSgCapture>;
        multi?: Record<string, RawSgCapture[]>;
    };
}
export interface RawSgCapture {
    text?: string;
    range?: RawSgRange;
}
export type EngineResult = {
    ok: true;
    matches: RawSgMatch[];
} | {
    ok: false;
    error: string;
};
export declare function runEngine(query: EngineQuery, language: string, root: string): EngineResult;
export {};
