import { FileInventory } from "./file-scope.js";
export interface ConsumerEvidence {
    kind: "import" | "runtime" | "test" | "type" | "reexport" | "public" | "uncertain";
    file: string;
    line: number;
    detail: string;
}
export interface ExportConsumers {
    name: string;
    exportedNames: string[];
    line: number;
    column: number;
    evidence: ConsumerEvidence[];
}
export interface ProjectConsumers {
    files: Record<string, ExportConsumers[]>;
    coverage: {
        inventory: FileInventory;
        issues: string[];
        snapshot: string;
        sourceDigests: Record<string, string>;
        durationMs: number;
        sourceBytes: number;
    };
}
/** One graph per SDK scan. All reads are captured before graph construction. */
export declare function projectConsumers(root: string): ProjectConsumers;
