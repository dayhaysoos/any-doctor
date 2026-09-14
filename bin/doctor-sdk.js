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
/** Host-owned bounded value disposition. It follows exact expression identity,
 * immutable aliases and the already-supported local relationships; unsupported
 * transfers stay unknown instead of becoming discarded. */
export function valueDispositionResult(file, source, facts, expression, query) {
    const digest = createHash("sha256").update(source).digest("hex"), flow = facts.structure.flow;
    const values = new Map(flow.values.map(value => [value.id, value])), bindings = new Map(flow.bindings.map(binding => [binding.binding, binding])), states = new Map(facts.structure.bindings.map(binding => [binding.binding, binding]));
    const byId = values.get(expression.id), subject = (byId === null || byId === void 0 ? void 0 : byId.start) === expression.start && byId.end === expression.end ? byId : flow.values.find(value => value.start === expression.start && value.end === expression.end);
    if (!subject)
        return unknown("unsupported-expression");
    const evidence = [{ kind: "expression", file, sourceDigest: digest, range: rangeOf(subject) }];
    const stable = (binding) => { var _a, _b; return !((_a = states.get(binding)) === null || _a === void 0 ? void 0 : _a.reassigned) && !((_b = states.get(binding)) === null || _b === void 0 ? void 0 : _b.mutated); };
    const resolve = (id, seen = new Set()) => { var _a, _b, _c, _d, _e, _f; const value = values.get(id); if (!value || seen.has(id))
        return null; seen = new Set(seen).add(id); if (value.kind === "reference" && ((_a = value.target) === null || _a === void 0 ? void 0 : _a.binding) !== null && ((_b = value.target) === null || _b === void 0 ? void 0 : _b.binding) !== undefined) {
        const binding = value.target.binding, initializer = (_c = bindings.get(binding)) === null || _c === void 0 ? void 0 : _c.initializer;
        if (stable(binding) && initializer !== undefined)
            return (_d = resolve(initializer, seen)) !== null && _d !== void 0 ? _d : value;
    } if (value.kind === "member" && value.receiver !== undefined && value.member !== null && value.member !== undefined) {
        const receiver = resolve(value.receiver, seen);
        if ((receiver === null || receiver === void 0 ? void 0 : receiver.kind) === "object") {
            let property;
            for (const item of (_e = receiver.properties) !== null && _e !== void 0 ? _e : [])
                if (!item.spread && item.name === value.member)
                    property = item;
            if (property && !property.accessor)
                return (_f = resolve(property.value, seen)) !== null && _f !== void 0 ? _f : value;
        }
    } return value; };
    const same = (id, parameter) => { var _a, _b; const raw = values.get(id); if (parameter !== undefined && (raw === null || raw === void 0 ? void 0 : raw.kind) === "reference" && ((_a = raw.target) === null || _a === void 0 ? void 0 : _a.binding) === parameter)
        return true; const resolved = resolve(id); return (resolved === null || resolved === void 0 ? void 0 : resolved.id) === subject.id || parameter !== undefined && (resolved === null || resolved === void 0 ? void 0 : resolved.kind) === "reference" && ((_b = resolved.target) === null || _b === void 0 ? void 0 : _b.binding) === parameter; };
    const contains = (id, parameter, seen = new Set()) => { var _a; if (same(id, parameter))
        return true; const value = resolve(id); if (!value || seen.has(value.id))
        return false; seen = new Set(seen).add(value.id); if (value.kind === "await" && value.value !== undefined)
        return contains(value.value, parameter, seen); if (value.kind === "choice")
        return !!((_a = value.alternatives) === null || _a === void 0 ? void 0 : _a.length) && value.alternatives.every(item => contains(item, parameter, seen)); const children = value.kind === "array" ? value.elements : value.kind === "object" ? value.properties : []; return !!(children === null || children === void 0 ? void 0 : children.some(item => contains(item.value, parameter, seen))); };
    const iterable = (id, parameter) => { var _a; if (same(id, parameter))
        return true; const value = resolve(id); return (value === null || value === void 0 ? void 0 : value.kind) === "array" && !!((_a = value.elements) === null || _a === void 0 ? void 0 : _a.some(item => item.spread && same(item.value, parameter))); };
    const targetName = (id) => { const value = resolve(id); if (!(value === null || value === void 0 ? void 0 : value.target) || value.target.binding !== null || !value.target.root)
        return null; return [value.target.root, ...value.target.members].join("."); };
    const calls = flow.values.filter(value => value.kind === "call" && !value.dead);
    const disposition = (parameter, owner, seen = new Set()) => {
        var _a, _b, _c;
        const key = `${subject.id}:${parameter}:${owner}`;
        if (seen.has(key))
            return "unknown";
        seen = new Set(seen).add(key);
        const direct = (use) => !use.dead && use.functionStart === owner;
        if (flow.uses.some(use => direct(use) && (use.kind === "return" || use.kind === "yield") && contains(use.value, parameter))) {
            const use = flow.uses.find(item => direct(item) && (item.kind === "return" || item.kind === "yield") && contains(item.value, parameter));
            if (use) {
                const value = values.get(use.value);
                if (value)
                    evidence.push({ kind: "expression", file, sourceDigest: digest, range: rangeOf(value), relationship: use.kind });
            }
            return "transferred";
        }
        for (const call of calls.filter(value => value.functionStart === owner))
            if (query.consumers.includes((_a = targetName(call.callee)) !== null && _a !== void 0 ? _a : "") && iterable(call.arguments[0], parameter))
                return "consumed";
        for (const loop of flow.loops.filter(loop => loop.functionStart === owner && iterable(loop.iterable, parameter))) {
            if (loop.await || flow.uses.some(use => { var _a, _b, _c; return direct(use) && use.kind === "await" && values.get(use.value).start >= loop.start && values.get(use.value).end <= loop.end && ((_a = values.get(use.value)) === null || _a === void 0 ? void 0 : _a.kind) === "reference" && ((_c = (_b = values.get(use.value)) === null || _b === void 0 ? void 0 : _b.target) === null || _c === void 0 ? void 0 : _c.binding) === loop.binding; }))
                return "consumed";
        }
        let uncertain = calls.some(call => call.functionStart === owner && call.receiver !== undefined && same(call.receiver, parameter));
        for (const call of calls.filter(value => { var _a; return value.functionStart === owner && !query.consumers.includes((_a = targetName(value.callee)) !== null && _a !== void 0 ? _a : ""); })) {
            for (let index = 0; index < ((_c = (_b = call.arguments) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 0); index++)
                if (contains(call.arguments[index], parameter)) {
                    if (!same(call.arguments[index], parameter)) {
                        uncertain = true;
                        continue;
                    }
                    const fn = resolve(call.callee);
                    if ((fn === null || fn === void 0 ? void 0 : fn.kind) === "function") {
                        const binding = facts.structure.bindings.find(item => { var _a; return ((_a = item.parameter) === null || _a === void 0 ? void 0 : _a.functionStart) === fn.start && item.parameter.index === index; });
                        const nested = binding ? disposition(binding.binding, fn.start, seen) : "unknown";
                        if (nested === "consumed")
                            return nested;
                        if (nested === "transferred") {
                            const next = valueDispositionOfCall(call, owner, seen);
                            if (next !== "discarded")
                                return next;
                        }
                        if (nested === "unknown")
                            uncertain = true;
                    }
                    else
                        uncertain = true;
                }
        }
        for (const binding of flow.bindings)
            if (binding.initializer === subject.id && !stable(binding.binding))
                uncertain = true;
        if (flow.uses.some(use => use.kind === "write" && use.value === subject.id))
            uncertain = true;
        return uncertain ? "unknown" : "discarded";
    };
    const valueDispositionOfCall = (call, owner, seen) => {
        if (flow.uses.some(use => !use.dead && use.functionStart === owner && (use.kind === "return" || use.kind === "yield") && containsCall(use.value, call.id)))
            return "transferred";
        if (calls.some(consumer => { var _a; return consumer.functionStart === owner && query.consumers.includes((_a = targetName(consumer.callee)) !== null && _a !== void 0 ? _a : "") && iterableCall(consumer.arguments[0], call.id); }))
            return "consumed";
        return flow.uses.some(use => !use.dead && use.functionStart === owner && use.kind === "discard" && containsCall(use.value, call.id)) ? "discarded" : "unknown";
    };
    const containsCall = (id, callId) => { var _a; return ((_a = resolve(id)) === null || _a === void 0 ? void 0 : _a.id) === callId; };
    const iterableCall = (id, callId) => containsCall(id, callId);
    const result = disposition(undefined, subject.functionStart);
    return result === "unknown" ? { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "unsupported-expression", evidence } : { version: SEMANTIC_RESULT_VERSION, status: "known", value: result, evidence };
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
