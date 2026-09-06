export interface RawSgMatch {
    file?: string;
    text?: string;
    range?: {
        start?: {
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
export declare function runEngineSearch(pattern: string, language: string, root: string): EngineResult;
