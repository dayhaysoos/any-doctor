export declare function fuzzyScore(query: string, text: string): number;
export declare function fuzzyFilter<T>(items: T[], textOf: (item: T) => string, query: string): T[];
