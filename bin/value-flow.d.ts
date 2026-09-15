import type { Node } from './analysis.js';
import type { CallTarget, SourceRange } from './contract.js';
/** Expression IDs are graph identities, not source offsets: a receiver and its
 * call may start at the same byte. This projection describes value uses, never
 * promise settlement, native APIs or framework policy. */
export interface FlowValue extends SourceRange {
    id: number;
    kind: 'unknown' | 'reference' | 'member' | 'literal' | 'array' | 'object' | 'call' | 'construct' | 'function' | 'await' | 'void' | 'choice' | 'super';
    functionStart: number | null;
    dead: boolean;
    conditional?: boolean;
    target?: CallTarget;
    primitive?: "string";
    literal?: string | number | boolean | null;
    receiver?: number;
    member?: string | null;
    callee?: number;
    arguments?: number[];
    argumentRoles?: {
        value: number;
        spread: boolean;
    }[];
    value?: number;
    alternatives?: number[];
    /** Source slot index preserves array holes; spread slots may expand at runtime. */
    elements?: {
        value: number;
        spread: boolean;
        index?: number;
    }[];
    properties?: {
        name: string | null;
        value: number;
        spread: boolean;
        accessor: boolean;
    }[];
    /** Cooked template segments interleaved with expression IDs; no evaluation. */
    template?: {
        quasis: (string | null)[];
        expressions: number[];
    };
    /** Syntax-only predicates established on entry to this expression. */
    guards?: {
        test: number;
        truthy: boolean;
    }[];
    operation?: {
        operator: string;
        operands: number[];
    };
    async?: boolean;
}
export interface ValueFlow {
    values: FlowValue[];
    bindings: {
        binding: number;
        initializer?: number;
        primitive?: "string";
        array: boolean;
        parameter?: {
            functionStart: number;
            index: number;
        };
        rest?: boolean;
    }[];
    uses: {
        value: number;
        kind: 'return' | 'yield' | 'await' | 'discard' | 'write';
        functionStart: number | null;
        binding?: number; /** Flow ID of the assignment destination, including member writes. */
        targetValue?: number;
        dead: boolean;
    }[];
    loops: (SourceRange & {
        functionStart: number | null;
        iterable: number;
        binding: number | null;
        bindings?: {
            binding: number;
            path: string[];
        }[];
        await: boolean;
    })[];
}
export declare function valueFlow(nodes: Node[], parents: Map<Node, Node>, target: (n: Node) => CallTarget, range: (n: Node) => SourceRange, unwrap: (n: Node) => Node, functionStart: (n: Node) => number | null): ValueFlow;
