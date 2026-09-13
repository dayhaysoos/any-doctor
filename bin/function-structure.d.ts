import { Node } from "./analysis.js";
import { SourceRange } from "./contract.js";
export interface FunctionStructure extends SourceRange {
    name: string;
    fingerprint: string;
    statements: number;
    nodes: number;
    captures: string[];
}
export declare function functionStructures(file: string, source: string): FunctionStructure[];
export declare function children(n: Node): Node[];
