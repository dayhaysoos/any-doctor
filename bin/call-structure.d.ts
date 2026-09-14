import type { Node } from './analysis.js';
import type { CallStructure, CallTarget, SourceRange } from './contract.js';
/** Generic value relationships, never framework policy or executable target code. */
export declare function callStructure(nodes: Node[], parents: Map<Node, Node>, target: (node: Node) => CallTarget, range: (node: Node) => SourceRange, unwrap: (node: Node) => Node, functionStart: (node: Node) => number | null): CallStructure;
