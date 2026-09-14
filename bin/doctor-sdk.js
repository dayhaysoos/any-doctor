import { createHash } from "node:crypto";
import { SEMANTIC_RESULT_VERSION } from "./contract.js";
const unknown = (reason, evidence) => ({
    version: SEMANTIC_RESULT_VERSION,
    status: "unknown",
    reason,
    ...((evidence === null || evidence === void 0 ? void 0 : evidence.length) ? { evidence } : {}),
});
/** Host-owned lexical identity. The doctor supplies accepted technology names;
 * parsing, alias resolution, shadowing and evidence stay behind this seam. */
export function identityResult(file, source, facts, expression, query) {
    var _a;
    const digest = createHash("sha256").update(source).digest("hex");
    const flow = facts.structure.flow;
    const values = new Map(flow.values.map((value) => [value.id, value]));
    const bindings = new Map(flow.bindings.map((binding) => [binding.binding, binding]));
    const states = new Map(facts.structure.bindings.map((binding) => [binding.binding, binding]));
    // Expression coordinates are the stable transport identity. The numeric id
    // is a same-projection fast path, not a promise that provider traversal ids
    // remain identical across independently materialized models.
    const byId = values.get(expression.id);
    const start = (byId === null || byId === void 0 ? void 0 : byId.start) === expression.start && byId.end === expression.end
        ? byId
        : flow.values.find((value) => value.start === expression.start && value.end === expression.end);
    if (!start)
        return unknown("unsupported-expression");
    const evidence = [];
    const addEvidence = (kind, value, relationship) => {
        if (evidence.some((item) => item.kind === kind && item.range.start === value.start && item.range.end === value.end))
            return;
        evidence.push({ kind, file, sourceDigest: digest, range: rangeOf(value), ...(relationship ? { relationship } : {}) });
    };
    const stable = (binding) => { var _a, _b; return !((_a = states.get(binding)) === null || _a === void 0 ? void 0 : _a.reassigned) && !((_b = states.get(binding)) === null || _b === void 0 ? void 0 : _b.mutated); };
    const resolve = (id, seen = new Set()) => {
        var _a, _b, _c;
        const value = values.get(id);
        if (!value || seen.has(id))
            return null;
        addEvidence(seen.size ? "alias" : "expression", value, seen.size ? "immutable-alias" : undefined);
        seen = new Set(seen).add(id);
        if (value.kind === "reference" && ((_a = value.target) === null || _a === void 0 ? void 0 : _a.binding) !== null && ((_b = value.target) === null || _b === void 0 ? void 0 : _b.binding) !== undefined) {
            const binding = value.target.binding;
            if (!stable(binding))
                return value;
            const initializer = (_c = bindings.get(binding)) === null || _c === void 0 ? void 0 : _c.initializer;
            if (initializer !== undefined) {
                const resolved = resolve(initializer, seen);
                if (resolved === null || resolved === void 0 ? void 0 : resolved.target)
                    return resolved;
                return value;
            }
        }
        return value;
    };
    const resolved = resolve(start.id);
    if (!(resolved === null || resolved === void 0 ? void 0 : resolved.target))
        return unknown("unsupported-expression", evidence);
    const origin = originOf(resolved.target);
    if (!origin)
        return unknown("unresolved-identity", evidence);
    if (origin.kind === "global" && !((_a = query.globals) !== null && _a !== void 0 ? _a : []).includes(origin.name))
        return unknown("unresolved-identity", evidence);
    if (origin.kind === "local") {
        const declaration = flow.values.find((value) => value.start === origin.binding && value.kind === "reference");
        if (declaration)
            evidence.push({ kind: "binding", file, sourceDigest: digest, range: rangeOf(declaration), relationship: "lexical-binding" });
    }
    return { version: SEMANTIC_RESULT_VERSION, status: "known", value: { matches: matches(origin, query), origin }, evidence };
}
function originOf(target) {
    if (target.source && target.importedName)
        return { kind: "import", source: target.source, name: target.importedName };
    if (target.binding !== null)
        return { kind: "local", binding: target.binding };
    if (!target.root)
        return null;
    const name = [target.root, ...target.members].join(".");
    return { kind: "global", name };
}
function matches(origin, query) {
    var _a, _b;
    if (origin.kind === "global")
        return ((_a = query.globals) !== null && _a !== void 0 ? _a : []).includes(origin.name);
    if (origin.kind === "import")
        return ((_b = query.imports) !== null && _b !== void 0 ? _b : []).some((item) => item.source === origin.source && item.names.includes(origin.name));
    return false;
}
function rangeOf(value) {
    return { start: value.start, end: value.end, line: value.line, column: value.column, endLine: value.endLine, endColumn: value.endColumn };
}
