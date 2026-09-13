export type FileRole = "authored" | "test" | "generated";
export interface FileInventory {
    files: {
        file: string;
        role: FileRole;
    }[];
    exclusions: string[];
}
export interface AnalysisConfig {
    exclude: string[];
    generated: string[];
    entryPoints: string[];
}
export declare function matchesPath(file: string, pattern: string): boolean;
export declare function readAnalysisConfig(root: string): AnalysisConfig;
export declare function fileRole(file: string, config: AnalysisConfig): FileRole;
export declare function inventory(root: string, exts?: string[], config?: AnalysisConfig): FileInventory;
