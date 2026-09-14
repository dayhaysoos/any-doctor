import type { Node } from './analysis.js';
import type { CallTarget, SourceRange } from './contract.js';
/** Expression IDs are graph identities, not source offsets: a receiver and its
 * call may start at the same byte. This projection describes value uses, never
 * promise settlement, native APIs or framework policy. */
export interface FlowValue extends SourceRange {
    id: number;
    kind: 'unknown' | 'reference' | 'member' | 'literal' | 'array' | 'object' | 'call' | 'construct' | 'function' | 'await' | 'void' | 'choice';
    functionStart: number | null;
    dead: boolean;
    target?: CallTarget;
    primitive?: "string";
    literal?: string | number | boolean | null;
    receiver?: number;
    member?: string | null;
    callee?: number;
    arguments?: number[];
    value?: number;
    alternatives?: number[];
    elements?: {
        value: number;
        spread: boolean;
    }[];
    properties?: {
        name: string | null;
        value: number;
        spread: boolean;
        accessor: boolean;
    }[];
    async?: boolean;
}
export interface ValueFlow {
    values: FlowValue[];
    bindings: {
        binding: number;
        initializer?: number;
        primitive?: "string";
        array: boolean;
    }[];
    uses: {
        value: number;
        kind: 'return' | 'await' | 'discard' | 'write';
        functionStart: number | null;
        binding?: number;
        dead: boolean;
    }[];
    loops: (SourceRange & {
        functionStart: number | null;
        iterable: number;
        binding: number | null;
        await: boolean;
    })[];
}
export declare function valueFlow(nodes: Node[], parents: Map<Node, Node>, target: (n: Node) => CallTarget, range: (n: Node) => SourceRange, unwrap: (n: Node) => Node, functionStart: (n: Node) => number | null): ValueFlow;
