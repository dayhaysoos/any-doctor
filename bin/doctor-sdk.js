import { createHash } from "node:crypto";
import { SEMANTIC_RESULT_VERSION } from "./contract.js";
import { recipeDefinition } from "./recipe-definitions.js";
const preparedFactsCache = new WeakMap();
function preparedFacts(facts, source) {
    let prepared = preparedFactsCache.get(facts);
    if (!prepared) {
        const flow = facts.structure.flow;
        prepared = { values: new Map(flow.values.map(value => [value.id, value])), byRange: new Map(flow.values.map(value => [`${value.start}:${value.end}`, value])), bindings: new Map(flow.bindings.map(binding => [binding.binding, binding])), states: new Map(facts.structure.bindings.map(binding => [binding.binding, binding])) };
        preparedFactsCache.set(facts, prepared);
    }
    if (source !== undefined && prepared.source !== source) {
        prepared.source = source;
        prepared.digest = createHash('sha256').update(source).digest('hex');
    }
    return prepared;
}
function expressionValue(prepared, expression) {
    const byId = prepared.values.get(expression.id);
    return (byId === null || byId === void 0 ? void 0 : byId.start) === expression.start && byId.end === expression.end ? byId : prepared.byRange.get(`${expression.start}:${expression.end}`);
}
/** Resolve one static property path at one source observation. This is a
 * deliberately small query: it exposes the answer and terminal expression,
 * while alias, spread, mutation and escape mechanics remain host-owned. */
export function valueAtPathResult(file, source, facts, expression, query) {
    const prepared = preparedFacts(facts, source), digest = prepared.digest, { values, bindings, states } = prepared;
    const subject = expressionValue(prepared, expression), at = expressionValue(prepared, query.at);
    if (!subject || !at || !Array.isArray(query.path) || !query.path.length || query.path.some(part => typeof part !== "string"))
        return unknown("unsupported-expression");
    // `at` is commonly the containing call, so its arguments legitimately
    // begin after at.start. Values outside its full range are future state.
    if (subject.start > at.end)
        return unknown("unsupported-expression");
    const evidence = [];
    const add = (kind, value, relationship) => {
        if (evidence.some(item => item.kind === kind && item.range.start === value.start && item.range.end === value.end && item.relationship === relationship))
            return;
        evidence.push({ kind, file, sourceDigest: digest, range: rangeOf(value), ...(relationship ? { relationship } : {}) });
    };
    add("expression", subject, "value-path-subject");
    add("expression", at, "value-path-observation");
    const beforeObservation = (start) => start === undefined || start < at.start || start > at.start && start < at.end;
    const stableAt = (binding, relativePath) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const state = states.get(binding);
        if (!state)
            return true;
        if (((_a = state.writes) !== null && _a !== void 0 ? _a : []).some(site => beforeObservation(site.start)))
            return false;
        if (((_b = state.mutationSites) !== null && _b !== void 0 ? _b : []).some(beforeObservation))
            return false;
        if (((_c = state.opaqueCallSites) !== null && _c !== void 0 ? _c : []).some(beforeObservation))
            return false;
        const initializer = (_d = bindings.get(binding)) === null || _d === void 0 ? void 0 : _d.initializer;
        const immutablePrimitive = (id, seen = new Set()) => {
            var _a, _b, _c, _d, _e;
            if (id === undefined || seen.has(id))
                return false;
            const value = values.get(id);
            if (!value)
                return false;
            seen = new Set(seen).add(id);
            if (value.kind === "literal" || value.template)
                return true;
            if (value.kind === "reference" && ((_a = value.target) === null || _a === void 0 ? void 0 : _a.binding) !== null && ((_b = value.target) === null || _b === void 0 ? void 0 : _b.binding) !== undefined) {
                const target = value.target.binding, targetState = states.get(target);
                if (((_c = targetState === null || targetState === void 0 ? void 0 : targetState.writes) !== null && _c !== void 0 ? _c : []).some(site => beforeObservation(site.start)) || (targetState === null || targetState === void 0 ? void 0 : targetState.reassigned))
                    return false;
                return immutablePrimitive((_d = bindings.get(target)) === null || _d === void 0 ? void 0 : _d.initializer, seen);
            }
            if ((_e = value.alternatives) === null || _e === void 0 ? void 0 : _e.length)
                return value.alternatives.every(item => immutablePrimitive(item, seen));
            return false;
        };
        // Passing a primitive cannot let the callee mutate the captured value.
        // Object identity transfers remain uncertain from the transfer onward.
        const overlaps = (left, right) => {
            const length = Math.min(left.length, right.length);
            return left.slice(0, length).every((part, index) => part === right[index]);
        };
        if (((_e = state.escapeSites) !== null && _e !== void 0 ? _e : []).some(site => { var _a; return beforeObservation(site.start) && !site.immutable && overlaps((_a = site.path) !== null && _a !== void 0 ? _a : [], relativePath); }) && !immutablePrimitive(initializer))
            return false;
        // Older or third-party fact providers may only supply aggregate flags.
        if (state.reassigned && !((_f = state.writes) !== null && _f !== void 0 ? _f : []).length)
            return false;
        if (state.mutated && !((_g = state.mutationSites) !== null && _g !== void 0 ? _g : []).length)
            return false;
        if (((_h = state.escapes) !== null && _h !== void 0 ? _h : []).length && !((_j = state.escapeSites) !== null && _j !== void 0 ? _j : []).length && !immutablePrimitive(initializer))
            return false;
        return true;
    };
    const resolve = (id, seen = new Set(), relativePath = []) => {
        var _a, _b, _c, _d, _e, _f;
        if (id === undefined || seen.has(id))
            return null;
        const value = values.get(id);
        if (!value)
            return null;
        if (value.start > at.end)
            return null;
        seen = new Set(seen).add(id);
        if (value.kind === "await" || value.kind === "void" && value.value !== undefined)
            return (_a = resolve(value.value, seen, relativePath)) !== null && _a !== void 0 ? _a : value;
        if (value.kind === "reference" && ((_b = value.target) === null || _b === void 0 ? void 0 : _b.binding) !== null && ((_c = value.target) === null || _c === void 0 ? void 0 : _c.binding) !== undefined) {
            const binding = value.target.binding, path = [...value.target.members, ...relativePath];
            if (!stableAt(binding, path))
                return null;
            const initializer = (_d = bindings.get(binding)) === null || _d === void 0 ? void 0 : _d.initializer;
            if (initializer !== undefined) {
                add("alias", value, "value-path-alias");
                return (_e = resolve(initializer, seen, path)) !== null && _e !== void 0 ? _e : null;
            }
        }
        if (value.kind === "member" && value.member !== null && value.member !== undefined) {
            const receiver = resolve(value.receiver, seen, [value.member, ...relativePath]);
            if (receiver) {
                const found = property(receiver, value.member, seen, relativePath);
                if (found.kind === "present")
                    return found.value;
            }
        }
        if ((_f = value.alternatives) === null || _f === void 0 ? void 0 : _f.length) {
            const alternatives = value.alternatives.map(id => resolve(id, seen, relativePath));
            const first = alternatives[0];
            if (first && alternatives.every(item => item && sameConstant(first, item)))
                return first;
            return null;
        }
        return value;
    };
    function property(input, name, seen = new Set(), remainingPath = []) {
        var _a;
        const object = resolve(input.id, seen, [name, ...remainingPath]);
        if (!object || seen.has(object.id) || object.kind !== "object")
            return { kind: "unknown" };
        seen = new Set(seen).add(object.id);
        add("expression", object, "value-path-object");
        let result = { kind: "absent" };
        for (const item of (_a = object.properties) !== null && _a !== void 0 ? _a : []) {
            if (item.spread) {
                const spread = resolve(item.value, seen, [name, ...remainingPath]);
                const nested = spread ? property(spread, name, seen, remainingPath) : { kind: "unknown" };
                if (nested.kind !== "absent")
                    result = nested;
                continue;
            }
            if (item.name === null) {
                result = { kind: "unknown" };
                continue;
            }
            // Configuration Doctors historically abstain on prototype inheritance:
            // Value Path proves explicit ordered configuration, not prototype lookup.
            if (item.name === "__proto__" && result.kind === "absent") {
                result = { kind: "unknown" };
                continue;
            }
            if (item.name === name) {
                const selected = item.accessor ? null : resolve(item.value, seen, remainingPath);
                result = selected ? { kind: "present", value: selected } : { kind: "unknown" };
            }
        }
        return result;
    }
    const sameConstant = (left, right) => left.kind === "literal" && right.kind === "literal" && left.literal === right.literal;
    const constant = (value, seen = new Set()) => {
        const resolved = resolve(value.id, seen);
        if (!resolved || seen.has(resolved.id))
            return undefined;
        if (resolved.kind === "literal")
            return resolved.literal;
        if (!resolved.template)
            return undefined;
        seen = new Set(seen).add(resolved.id);
        let text = resolved.template.quasis[0];
        if (text === null)
            return undefined;
        for (let i = 0; i < resolved.template.expressions.length; i++) {
            const part = resolve(resolved.template.expressions[i], seen), suffix = resolved.template.quasis[i + 1];
            if (!part || suffix === null)
                return undefined;
            const literal = constant(part, seen);
            if (literal === undefined)
                return undefined;
            text += String(literal) + suffix;
        }
        return text;
    };
    let current = resolve(subject.id, new Set(), query.path);
    if (!current)
        return unknown("unsupported-expression", evidence);
    for (let index = 0; index < query.path.length; index++) {
        const found = property(current, query.path[index], new Set(), query.path.slice(index + 1));
        if (found.kind === "unknown")
            return unknown("unsupported-expression", evidence);
        if (found.kind === "absent")
            return { version: SEMANTIC_RESULT_VERSION, status: "known", value: { state: "absent" }, evidence };
        current = found.value;
    }
    add("expression", current, "value-path-terminal");
    const literal = constant(current);
    return { version: SEMANTIC_RESULT_VERSION, status: "known", value: { state: "present", expression: { id: current.id, start: current.start, end: current.end }, ...(literal !== undefined ? { constant: literal } : {}) }, evidence };
}
const unknown = (reason, evidence) => ({
    version: SEMANTIC_RESULT_VERSION,
    status: "unknown",
    reason,
    ...((evidence === null || evidence === void 0 ? void 0 : evidence.length) ? { evidence } : {}),
});
/** Host-owned lexical identity. The doctor supplies accepted technology names;
 * parsing, alias resolution, shadowing and evidence stay behind this seam. */
export function identityResult(file, source, facts, expression, query) {
    var _a, _b, _c, _d;
    const prepared = preparedFacts(facts, source), digest = prepared.digest;
    const flow = facts.structure.flow;
    const { values, bindings, states } = prepared;
    // Expression coordinates are the stable transport identity. The numeric id
    // is a same-projection fast path, not a promise that provider traversal ids
    // remain identical across independently materialized models.
    const start = expressionValue(prepared, expression);
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
    const required = resolved.kind === "call" && resolved.target.binding === null && resolved.target.root === "require"
        ? values.get((_c = (_b = (_a = resolved.argumentRoles) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.value) !== null && _c !== void 0 ? _c : -1)
        : undefined;
    const origin = (required === null || required === void 0 ? void 0 : required.kind) === "literal" && typeof required.literal === "string"
        ? { kind: "import", source: required.literal, name: "default" }
        : originOf(resolved.target);
    if (!origin)
        return unknown("unresolved-identity", evidence);
    if (origin.kind === "global" && !((_d = query.globals) !== null && _d !== void 0 ? _d : []).includes(origin.name))
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
    const prepared = preparedFacts(facts, source), digest = prepared.digest, flow = facts.structure.flow, { values, bindings, states } = prepared;
    const subject = expressionValue(prepared, expression);
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
    const consumerTakes = (call, parameter) => {
        var _a, _b;
        const role = (_a = call.argumentRoles) === null || _a === void 0 ? void 0 : _a[0];
        if (!role)
            return false;
        if (!role.spread)
            return iterable(role.value, parameter);
        const spread = resolve(role.value);
        const first = (spread === null || spread === void 0 ? void 0 : spread.kind) === "array" ? (_b = spread.elements) === null || _b === void 0 ? void 0 : _b[0] : undefined;
        return !!first && !first.spread && same(first.value, parameter);
    };
    const spreadArgument = (call, parameter) => { var _a; return ((_a = call.argumentRoles) !== null && _a !== void 0 ? _a : []).some(role => role.spread && same(role.value, parameter)); };
    const disposition = (parameter, owner, seen = new Set()) => {
        var _a, _b, _c, _d;
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
            if (query.consumers.includes((_a = targetName(call.callee)) !== null && _a !== void 0 ? _a : "") && consumerTakes(call, parameter))
                return "consumed";
        for (const loop of flow.loops.filter(loop => loop.functionStart === owner && iterable(loop.iterable, parameter))) {
            if (loop.await || flow.uses.some(use => { var _a, _b, _c; return direct(use) && use.kind === "await" && values.get(use.value).start >= loop.start && values.get(use.value).end <= loop.end && ((_a = values.get(use.value)) === null || _a === void 0 ? void 0 : _a.kind) === "reference" && ((_c = (_b = values.get(use.value)) === null || _b === void 0 ? void 0 : _b.target) === null || _c === void 0 ? void 0 : _c.binding) === loop.binding; }))
                return "consumed";
        }
        for (const store of calls.filter(call => call.functionStart === owner && call.member === "push" && call.receiver !== undefined && spreadArgument(call, parameter))) {
            if (calls.some(call => { var _a; return call.functionStart === owner && query.consumers.includes((_a = targetName(call.callee)) !== null && _a !== void 0 ? _a : "") && consumerTakesValue(call, store.receiver); }))
                return "consumed";
            return "transferred";
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
                        const role = (_d = call.argumentRoles) === null || _d === void 0 ? void 0 : _d[index], binding = flow.bindings.find(item => { var _a; return ((_a = item.parameter) === null || _a === void 0 ? void 0 : _a.functionStart) === fn.start && item.parameter.index === index; });
                        if ((role === null || role === void 0 ? void 0 : role.spread) && !(binding === null || binding === void 0 ? void 0 : binding.rest)) {
                            uncertain = true;
                            continue;
                        }
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
    const consumerTakesValue = (call, valueId) => {
        var _a, _b, _c, _d, _e, _f;
        const role = (_a = call.argumentRoles) === null || _a === void 0 ? void 0 : _a[0];
        if (!role)
            return false;
        if (!role.spread) {
            const value = resolve(role.value);
            return (value === null || value === void 0 ? void 0 : value.id) === ((_b = resolve(valueId)) === null || _b === void 0 ? void 0 : _b.id) || (value === null || value === void 0 ? void 0 : value.kind) === "array" && !!((_c = value.elements) === null || _c === void 0 ? void 0 : _c.some(item => { var _a, _b; return item.spread && ((_a = resolve(item.value)) === null || _a === void 0 ? void 0 : _a.id) === ((_b = resolve(valueId)) === null || _b === void 0 ? void 0 : _b.id); }));
        }
        const spread = resolve(role.value), first = (spread === null || spread === void 0 ? void 0 : spread.kind) === "array" ? (_d = spread.elements) === null || _d === void 0 ? void 0 : _d[0] : undefined;
        return !!first && !first.spread && ((_e = resolve(first.value)) === null || _e === void 0 ? void 0 : _e.id) === ((_f = resolve(valueId)) === null || _f === void 0 ? void 0 : _f.id);
    };
    const valueDispositionOfCall = (call, owner, seen) => {
        if (flow.uses.some(use => !use.dead && use.functionStart === owner && (use.kind === "return" || use.kind === "yield") && containsCall(use.value, call.id)))
            return "transferred";
        if (calls.some(consumer => { var _a; return consumer.functionStart === owner && query.consumers.includes((_a = targetName(consumer.callee)) !== null && _a !== void 0 ? _a : "") && consumerTakesValue(consumer, call.id); }))
            return "consumed";
        return flow.uses.some(use => !use.dead && use.functionStart === owner && use.kind === "discard" && containsCall(use.value, call.id)) ? "discarded" : "unknown";
    };
    const containsCall = (id, callId) => { var _a; return ((_a = resolve(id)) === null || _a === void 0 ? void 0 : _a.id) === callId; };
    const result = disposition(undefined, subject.functionStart);
    return result === "unknown" ? { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "unsupported-expression", evidence } : { version: SEMANTIC_RESULT_VERSION, status: "known", value: result, evidence };
}
/** Host-owned resource matching through returned cleanup functions and directly
 * called local helpers/factories. It proves release only for the exact handle. */
export function resourceLifetimeResult(file, source, facts, acquisition, query) {
    var _a;
    const prepared = preparedFacts(facts, source), digest = prepared.digest, flow = facts.structure.flow, { values, bindings, states } = prepared;
    const pick = (ref) => expressionValue(prepared, ref);
    const subject = pick(acquisition), owner = pick(query.owner);
    if (!subject || subject.kind !== 'call' || !owner || owner.kind !== 'function')
        return unknown('unsupported-expression');
    const evidence = [{ kind: 'expression', file, sourceDigest: digest, range: rangeOf(subject), relationship: 'acquisition' }];
    const stable = (binding) => { var _a, _b; return !((_a = states.get(binding)) === null || _a === void 0 ? void 0 : _a.reassigned) && !((_b = states.get(binding)) === null || _b === void 0 ? void 0 : _b.mutated); };
    const resolve = (id, seen = new Set()) => { var _a, _b, _c, _d; const value = values.get(id); if (!value || seen.has(id))
        return null; seen = new Set(seen).add(id); if (value.kind === 'reference' && ((_a = value.target) === null || _a === void 0 ? void 0 : _a.binding) !== null && ((_b = value.target) === null || _b === void 0 ? void 0 : _b.binding) !== undefined) {
        const binding = value.target.binding, initializer = (_c = bindings.get(binding)) === null || _c === void 0 ? void 0 : _c.initializer;
        if (stable(binding) && initializer !== undefined)
            return (_d = resolve(initializer, seen)) !== null && _d !== void 0 ? _d : value;
    } return value; };
    const name = (id) => { const value = resolve(id); if (!(value === null || value === void 0 ? void 0 : value.target) || value.target.binding !== null || !value.target.root)
        return null; return [value.target.root, ...value.target.members].join('.'); };
    const acquisitionBindings = new Set();
    for (const binding of flow.bindings)
        if (binding.initializer === subject.id && stable(binding.binding))
            acquisitionBindings.add(binding.binding);
    for (const use of flow.uses)
        if (!use.dead && use.kind === 'write' && use.value === subject.id && use.binding !== undefined && !flow.uses.some(other => !other.dead && other.kind === 'write' && other.binding === use.binding && other.value !== subject.id))
            acquisitionBindings.add(use.binding);
    const isHandle = (id, env, seen = new Set()) => { var _a, _b, _c; const value = values.get(id); if (!value || seen.has(id))
        return false; seen = new Set(seen).add(id); if (value.kind === 'reference' && ((_a = value.target) === null || _a === void 0 ? void 0 : _a.binding) !== null && ((_b = value.target) === null || _b === void 0 ? void 0 : _b.binding) !== undefined) {
        const binding = value.target.binding;
        if (env.has(binding) || acquisitionBindings.has(binding))
            return true;
        const initializer = (_c = bindings.get(binding)) === null || _c === void 0 ? void 0 : _c.initializer;
        return stable(binding) && initializer !== undefined && isHandle(initializer, env, seen);
    } return false; };
    const calls = flow.values.filter(value => value.kind === 'call' && !value.dead);
    const reachable = new Set([owner.start]), queue = [owner.start];
    while (queue.length) {
        const current = queue.shift();
        for (const call of calls.filter(value => value.functionStart === current)) {
            const fn = resolve(call.callee);
            if ((fn === null || fn === void 0 ? void 0 : fn.kind) === 'function' && !reachable.has(fn.start)) {
                reachable.add(fn.start);
                queue.push(fn.start);
            }
        }
    }
    if (subject.functionStart !== owner.start && !reachable.has((_a = subject.functionStart) !== null && _a !== void 0 ? _a : -1))
        return unknown('outside-owner', evidence);
    const bindArgs = (call, fn, parent) => { var _a; const out = new Set(); for (const parameter of flow.bindings.filter(binding => { var _a; return ((_a = binding.parameter) === null || _a === void 0 ? void 0 : _a.functionStart) === fn.start; })) {
        const actual = (_a = call.arguments) === null || _a === void 0 ? void 0 : _a[parameter.parameter.index];
        if (actual !== undefined && isHandle(actual, parent))
            out.add(parameter.binding);
    } return out; };
    const cleanupContexts = (id, parent, seen = new Set()) => { var _a; const value = resolve(id); if (!value || seen.has(value.id))
        return null; seen = new Set(seen).add(value.id); if (value.kind === 'function')
        return [{ start: value.start, handles: new Set(parent), conditional: !!value.conditional }]; if (value.kind === 'call') {
        const fn = resolve(value.callee);
        if ((fn === null || fn === void 0 ? void 0 : fn.kind) !== 'function')
            return null;
        const env = bindArgs(value, fn, parent), returns = flow.uses.filter(use => !use.dead && use.kind === 'return' && use.functionStart === fn.start);
        if (!returns.length)
            return [];
        const all = returns.flatMap(use => { var _a; return (_a = cleanupContexts(use.value, env, seen)) !== null && _a !== void 0 ? _a : []; });
        return all.length ? all : null;
    } if (value.kind === 'choice') {
        const branches = (_a = value.alternatives) === null || _a === void 0 ? void 0 : _a.map(item => cleanupContexts(item, parent, seen));
        return (branches === null || branches === void 0 ? void 0 : branches.every(Boolean)) ? branches.flatMap(item => item) : null;
    } return null; };
    const returned = flow.uses.filter(use => !use.dead && use.kind === 'return' && use.functionStart === owner.start);
    if (!returned.length)
        return { version: SEMANTIC_RESULT_VERSION, status: 'known', value: 'unreleased', evidence };
    const contexts = returned.flatMap(use => { var _a; return (_a = cleanupContexts(use.value, new Set())) !== null && _a !== void 0 ? _a : []; });
    if (!contexts.length)
        return { version: SEMANTIC_RESULT_VERSION, status: 'unknown', reason: 'unsupported-expression', evidence };
    const inspect = (context, seen = new Set()) => {
        var _a, _b, _c;
        const key = `${context.start}:${[...context.handles].sort().join(',')}`;
        if (seen.has(key))
            return 'unknown';
        seen = new Set(seen).add(key);
        let uncertain = false;
        for (const call of calls.filter(value => value.functionStart === context.start)) {
            if (query.release.includes((_a = name(call.callee)) !== null && _a !== void 0 ? _a : '') && ((_b = call.arguments) === null || _b === void 0 ? void 0 : _b[0]) !== undefined && isHandle(call.arguments[0], context.handles)) {
                if (call.conditional)
                    return 'unknown';
                evidence.push({ kind: 'expression', file, sourceDigest: digest, range: rangeOf(call), relationship: 'release' });
                return 'released';
            }
            const carries = ((_c = call.arguments) !== null && _c !== void 0 ? _c : []).some(argument => isHandle(argument, context.handles));
            const fn = resolve(call.callee);
            if ((fn === null || fn === void 0 ? void 0 : fn.kind) === 'function') {
                const nested = inspect({ start: fn.start, handles: bindArgs(call, fn, context.handles), conditional: context.conditional || !!call.conditional }, seen);
                if (nested === 'released')
                    return nested;
                if (nested === 'unknown')
                    uncertain = true;
            }
            else if (carries)
                uncertain = true;
        }
        return uncertain ? 'unknown' : 'unreleased';
    };
    const outcomes = contexts.map(context => ({ context, value: inspect(context) }));
    if (outcomes.every(item => item.value === 'released') || outcomes.some(item => item.value === 'released' && !item.context.conditional) && outcomes.every(item => item.value === 'released' || item.context.conditional))
        return { version: SEMANTIC_RESULT_VERSION, status: 'known', value: 'released', evidence };
    if (outcomes.some(item => item.value === 'unknown') || new Set(outcomes.map(item => item.value)).size > 1)
        return { version: SEMANTIC_RESULT_VERSION, status: 'unknown', reason: 'unsupported-expression', evidence };
    return { version: SEMANTIC_RESULT_VERSION, status: 'known', value: 'unreleased', evidence };
}
/** Host-owned structured option lookup. Ordered own properties and supported
 * spreads override inherited values. `undefined` is an ignored WebIDL member,
 * while `null` establishes absence for nullable request options such as signal. */
export function optionPresenceResult(file, source, facts, expression, query) {
    const prepared = preparedFacts(facts, source), digest = prepared.digest, flow = facts.structure.flow, { values, bindings, states } = prepared;
    const subject = expressionValue(prepared, expression);
    if (!subject || subject.kind !== "call" && subject.kind !== "construct")
        return unknown("unsupported-expression");
    const evidence = [];
    const add = (value, relationship) => { if (!evidence.some(item => item.range.start === value.start && item.range.end === value.end && item.relationship === relationship))
        evidence.push({ kind: "expression", file, sourceDigest: digest, range: rangeOf(value), relationship }); };
    add(subject, "option-call");
    const stable = (binding) => { var _a, _b; return !((_a = states.get(binding)) === null || _a === void 0 ? void 0 : _a.reassigned) && !((_b = states.get(binding)) === null || _b === void 0 ? void 0 : _b.mutated); };
    const resolve = (id, seen = new Set()) => { var _a, _b, _c, _d; if (id === undefined)
        return null; const value = values.get(id); if (!value || seen.has(id))
        return null; seen = new Set(seen).add(id); if (value.kind === "reference" && ((_a = value.target) === null || _a === void 0 ? void 0 : _a.binding) !== null && ((_b = value.target) === null || _b === void 0 ? void 0 : _b.binding) !== undefined) {
        if (!stable(value.target.binding))
            return null;
        const initializer = (_c = bindings.get(value.target.binding)) === null || _c === void 0 ? void 0 : _c.initializer;
        if (initializer !== undefined) {
            add(value, "immutable-alias");
            return (_d = resolve(initializer, seen)) !== null && _d !== void 0 ? _d : value;
        }
    } return value; };
    const targetName = (id) => { const value = resolve(id); if (!(value === null || value === void 0 ? void 0 : value.target) || value.target.binding !== null || !value.target.root)
        return null; return [value.target.root, ...value.target.members].join("."); };
    const isUndefined = (id) => { var _a; const value = resolve(id); return (value === null || value === void 0 ? void 0 : value.kind) === "void" || (value === null || value === void 0 ? void 0 : value.kind) === "reference" && ((_a = value.target) === null || _a === void 0 ? void 0 : _a.binding) === null && value.target.root === "undefined"; };
    const optionValue = (id) => {
        var _a, _b, _c;
        const value = resolve(id);
        if (!value)
            return "unknown";
        add(value, "option-value");
        if (isUndefined(id))
            return "ignored";
        if (value.kind === "literal" && value.literal === null)
            return "absent";
        if (query.option === "signal") {
            if (value.kind === "member" && value.member === "signal" && ((_a = resolve(value.receiver)) === null || _a === void 0 ? void 0 : _a.kind) === "construct" && targetName((_b = resolve(value.receiver)) === null || _b === void 0 ? void 0 : _b.callee) === "AbortController")
                return "present";
            if (value.kind === "call" && ["timeout", "abort", "any"].includes((_c = value.member) !== null && _c !== void 0 ? _c : "") && targetName(value.receiver) === "AbortSignal")
                return "present";
        }
        return value.kind === "literal" && value.literal !== null ? "present" : "unknown";
    };
    const sameTarget = (a, b) => !!b && a.binding === b.binding && a.root === b.root && a.members.join(".") === b.members.join(".");
    const property = (id, name, seen = new Set()) => {
        var _a, _b, _c, _d, _e;
        if (id === undefined || isUndefined(id) || ((_a = resolve(id)) === null || _a === void 0 ? void 0 : _a.kind) === "literal" && ((_b = resolve(id)) === null || _b === void 0 ? void 0 : _b.literal) === null)
            return "ignored";
        const raw = values.get(id), binding = (_c = raw === null || raw === void 0 ? void 0 : raw.target) === null || _c === void 0 ? void 0 : _c.binding;
        if (binding !== null && binding !== undefined) {
            const state = states.get(binding);
            if (!stable(binding) || ((_d = state === null || state === void 0 ? void 0 : state.escapes) === null || _d === void 0 ? void 0 : _d.some(target => !sameTarget(target, subject.target))))
                return "unknown";
        }
        const value = resolve(id);
        if (!value || seen.has(value.id) || value.kind !== "object")
            return "unknown";
        seen = new Set(seen).add(value.id);
        add(value, "option-object");
        let result = "missing";
        for (const item of (_e = value.properties) !== null && _e !== void 0 ? _e : []) {
            if (item.spread) {
                const nested = property(item.value, name, seen);
                if (nested !== "missing")
                    result = nested;
                continue;
            }
            if (item.name === null) {
                result = "unknown";
                continue;
            }
            if (item.name === "__proto__" && result === "missing") {
                const inherited = property(item.value, name, seen);
                if (inherited !== "missing")
                    result = inherited;
                continue;
            }
            if (item.name === name)
                result = item.accessor ? "unknown" : optionValue(item.value);
        }
        return result;
    };
    const input = (call, seen = new Set()) => {
        var _a, _b, _c, _d, _e;
        if (seen.has(call.id))
            return "unknown";
        seen = new Set(seen).add(call.id);
        const option = property((_a = call.arguments) === null || _a === void 0 ? void 0 : _a[1], query.option);
        if (option === "present" || option === "unknown" || option === "absent")
            return option;
        const first = resolve((_b = call.arguments) === null || _b === void 0 ? void 0 : _b[0]);
        if ((first === null || first === void 0 ? void 0 : first.kind) === "construct" && query.sources.includes("Request") && targetName(first.callee) === "Request") {
            add(first, "option-source");
            return input(first, seen);
        }
        if ((first === null || first === void 0 ? void 0 : first.kind) === "literal" || (first === null || first === void 0 ? void 0 : first.primitive) === "string" || (first === null || first === void 0 ? void 0 : first.kind) === "reference" && ((_e = bindings.get((_d = (_c = first.target) === null || _c === void 0 ? void 0 : _c.binding) !== null && _d !== void 0 ? _d : -1)) === null || _e === void 0 ? void 0 : _e.primitive) === "string")
            return "absent";
        return "unknown";
    };
    const result = input(subject);
    return result === "unknown" || result === "ignored" || result === "missing" ? unknown("unsupported-expression", evidence) : { version: SEMANTIC_RESULT_VERSION, status: "known", value: result, evidence };
}
const semanticRef = (value) => ({ id: value.id, start: value.start, end: value.end });
const recipeUnknown = (result) => { var _a; return result.status === 'unknown' ? { version: SEMANTIC_RESULT_VERSION, status: 'unknown', reason: result.reason, ...(((_a = result.evidence) === null || _a === void 0 ? void 0 : _a.length) ? { evidence: result.evidence } : {}) } : unknown('provider-failure'); };
const recipeKnown = (value, evidence) => ({ version: SEMANTIC_RESULT_VERSION, status: 'known', value, evidence });
/** Recipe: resolve a configured producer and report only when its exact value is
 * established as discarded. Array identity is owned here, not by consumers. */
export function unhandledValueRecipeResult(file, source, facts, expression, query) {
    return recipeDefinition("unhandled-value").evaluate(recipeEvaluationRuntime, file, source, facts, expression, query);
}
/** Establish the recipe's candidate space before requesting semantic identity.
 * A lexical alias may use any name. Follow stable initializers and static own
 * properties; an opaque value stays uncertain, while an unrelated spelling or
 * a proven local function/parameter is outside this recipe's identity claim. */
function identityCandidate(prepared, value, query, seen = new Set()) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    if (seen.has(value.id))
        return 'unknown';
    seen = new Set(seen).add(value.id);
    const { values, bindings, states } = prepared;
    const visit = (id) => {
        const child = id === undefined ? undefined : values.get(id);
        return child ? identityCandidate(prepared, child, query, seen) : 'unknown';
    };
    const target = value.target;
    // A factory's spelling says nothing about the identity of its return value.
    if (value.kind === 'call' || value.kind === 'construct')
        return 'unknown';
    if (target === null || target === void 0 ? void 0 : target.source) {
        const origin = originOf(target);
        return origin && matches(origin, query) ? value : 'clear';
    }
    if (value.kind === 'reference' && (target === null || target === void 0 ? void 0 : target.binding) !== null && (target === null || target === void 0 ? void 0 : target.binding) !== undefined) {
        const state = states.get(target.binding), binding = bindings.get(target.binding);
        if ((state === null || state === void 0 ? void 0 : state.reassigned) || (state === null || state === void 0 ? void 0 : state.mutated))
            return 'unknown';
        if ((binding === null || binding === void 0 ? void 0 : binding.initializer) !== undefined)
            return visit(binding.initializer);
        return (binding === null || binding === void 0 ? void 0 : binding.parameter) ? 'clear' : 'unknown';
    }
    if (value.kind === 'function' || value.kind === 'literal' || value.kind === 'object' || value.kind === 'array' || value.kind === 'super')
        return 'clear';
    if (value.kind === 'choice' || value.kind === 'unknown' && value.alternatives) {
        const branches = (_a = value.alternatives) === null || _a === void 0 ? void 0 : _a.map(visit);
        return (branches === null || branches === void 0 ? void 0 : branches.length) && branches.every(branch => branch === 'clear') ? 'clear' : 'unknown';
    }
    if (value.kind === 'member') {
        if (value.member === null || value.member === undefined)
            return 'unknown';
        // Resolve an own data property before spelling rejection: { request: fetch }
        // is a justified alias, regardless of the property's local name.
        let receiver = value.receiver === undefined ? undefined : values.get(value.receiver);
        const receiverSeen = new Set();
        while ((receiver === null || receiver === void 0 ? void 0 : receiver.kind) === 'reference' && ((_b = receiver.target) === null || _b === void 0 ? void 0 : _b.binding) !== null && ((_c = receiver.target) === null || _c === void 0 ? void 0 : _c.binding) !== undefined) {
            const binding = receiver.target.binding, state = states.get(binding);
            if (receiverSeen.has(binding) || (state === null || state === void 0 ? void 0 : state.reassigned) || (state === null || state === void 0 ? void 0 : state.mutated) || ((_d = state === null || state === void 0 ? void 0 : state.escapes) === null || _d === void 0 ? void 0 : _d.length))
                break;
            receiverSeen.add(binding);
            const initializer = (_e = bindings.get(binding)) === null || _e === void 0 ? void 0 : _e.initializer;
            if (initializer === undefined)
                break;
            receiver = values.get(initializer);
        }
        if ((receiver === null || receiver === void 0 ? void 0 : receiver.kind) === 'object' && value.member !== null && value.member !== undefined) {
            let property;
            for (const item of (_f = receiver.properties) !== null && _f !== void 0 ? _f : []) {
                if (item.spread || item.name === null)
                    property = undefined;
                else if (item.name === value.member)
                    property = item;
            }
            if (property && !property.accessor)
                return visit(property.value);
            if (property === null || property === void 0 ? void 0 : property.accessor)
                return 'unknown';
        }
        // A member rooted at a lexical parameter is a proven local lookalike,
        // even when its property spelling matches the configured global member.
        // Do not narrow a scan for `function f(process) { process.exit() }`.
        if ((receiver === null || receiver === void 0 ? void 0 : receiver.kind) === 'reference' && ((_g = receiver.target) === null || _g === void 0 ? void 0 : _g.binding) !== null && ((_h = receiver.target) === null || _h === void 0 ? void 0 : _h.binding) !== undefined
            && ((_j = bindings.get(receiver.target.binding)) === null || _j === void 0 ? void 0 : _j.parameter))
            return 'clear';
        const members = [...((_k = query.globals) !== null && _k !== void 0 ? _k : []), ...((_l = query.imports) !== null && _l !== void 0 ? _l : []).flatMap(item => item.names)];
        if (value.member !== null && value.member !== undefined && !members.some(name => name.split('.').at(-1) === value.member))
            return 'clear';
    }
    if ((target === null || target === void 0 ? void 0 : target.binding) === null && target.root) {
        return ((_m = query.globals) !== null && _m !== void 0 ? _m : []).includes([target.root, ...target.members].join('.')) ? value : 'clear';
    }
    return 'unknown';
}
/** Candidate-aware call identity for custom checks. Reuse the recipe's
 * membership rules without emitting a policy finding or private name filters. */
export function callIdentityResult(file, source, facts, expression, query) {
    const prepared = preparedFacts(facts, source), call = expressionValue(prepared, expression);
    if (!call || call.kind !== 'call' || call.callee === undefined)
        return unknown('unsupported-expression');
    const callee = prepared.values.get(call.callee);
    if (!callee)
        return unknown('unsupported-expression');
    const candidate = identityCandidate(prepared, callee, query);
    const evidence = [{ kind: 'expression', file, sourceDigest: prepared.digest, range: rangeOf(call) }];
    if (candidate === 'clear')
        return { version: SEMANTIC_RESULT_VERSION, status: 'known', value: { matches: false }, evidence };
    if (candidate === 'unknown')
        return unknown('unresolved-identity', evidence);
    const result = identityResult(file, source, facts, semanticRef(candidate), query);
    // An unresolved member receiver can still hold a configured call. A local
    // origin alone is not a proven nonmatch; parameters/own methods cleared above.
    if (result.status === 'known' && !result.value.matches && result.value.origin.kind === 'local' && candidate.kind === 'member')
        return unknown('unresolved-identity', evidence);
    return result.status === 'unknown' ? result : { ...result, value: { matches: result.value.matches } };
}
/** Forbidden-call membership is deliberately narrower than arbitrary runtime
 * identity: a local callable is outside a direct-call claim unless a supported
 * initializer links it to the forbidden target. Mutation after such a link is
 * uncertain; an unrelated local parameter or helper is simply clear. */
function forbiddenCallCandidate(prepared, value, query) {
    var _a, _b, _c, _d;
    if (value.kind === 'member') {
        const targetMembers = [...((_a = query.globals) !== null && _a !== void 0 ? _a : []), ...((_b = query.imports) !== null && _b !== void 0 ? _b : []).flatMap(item => item.names)]
            .map(name => name.split('.').at(-1));
        if (value.member !== null && value.member !== undefined && !targetMembers.includes(value.member))
            return 'clear';
    }
    const binding = (_c = value.target) === null || _c === void 0 ? void 0 : _c.binding;
    if (binding !== null && binding !== undefined) {
        const initializer = (_d = prepared.bindings.get(binding)) === null || _d === void 0 ? void 0 : _d.initializer;
        if (initializer === undefined)
            return 'clear';
        const initial = prepared.values.get(initializer);
        if (!initial)
            return 'unknown';
        const state = prepared.states.get(binding);
        if ((state === null || state === void 0 ? void 0 : state.reassigned) || (state === null || state === void 0 ? void 0 : state.mutated))
            return 'unknown';
        // A callable produced by invoking or constructing something is not a
        // supported direct alias. Its runtime result may be anything, but this
        // recipe intentionally claims direct identities and lexical aliases only.
        if (initial.kind === 'call' || initial.kind === 'construct')
            return 'clear';
    }
    return identityCandidate(prepared, value, query);
}
/** Recipe: report a call only when its callee resolves to the configured
 * global or import identity. Transparent JavaScript and TypeScript wrappers
 * are normalized by the shared call model before this recipe sees them. */
export function forbiddenCallRecipeResult(file, source, facts, expression, query) {
    return recipeDefinition("forbidden-call").evaluate(recipeEvaluationRuntime, file, source, facts, expression, query);
}
/** Recipe: combine configured call identity with structured option presence. */
export function requiredOptionRecipeResult(file, source, facts, expression, query) {
    return recipeDefinition("required-or-recommended-option").evaluate(recipeEvaluationRuntime, file, source, facts, expression, query);
}
/** Recipe: find a configured owner, validate acquisition identity and classify
 * the exact handle in that owner's returned cleanup. */
export function resourceWithoutReleaseRecipeResult(file, source, facts, expression, query) {
    return recipeDefinition("resource-without-release").evaluate(recipeEvaluationRuntime, file, source, facts, expression, query);
}
function originOf(target) {
    if (target.source && target.importedName)
        return { kind: "import", source: target.source, name: [target.importedName, ...target.members].join('.') };
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
/** Internal adapter used by locally complete recipe modules. It exposes the
 * shared semantic mechanics recipes compose without making those mechanics a
 * second public Doctor interface. */
export const recipeEvaluationRuntime = {
    prepare: preparedFacts,
    expression: expressionValue,
    ref: semanticRef,
    known: recipeKnown,
    unknown: (reason, evidence) => ({
        version: SEMANTIC_RESULT_VERSION,
        status: "unknown",
        reason,
        ...((evidence === null || evidence === void 0 ? void 0 : evidence.length) ? { evidence } : {}),
    }),
    unknownFrom: recipeUnknown,
    identityCandidate,
    forbiddenCallCandidate,
    identity: (file, source, facts, expression, query) => {
        const result = identityResult(file, source, facts, expression, query);
        return result.status === "unknown" ? result : { ...result, value: { matches: result.value.matches } };
    },
    disposition: valueDispositionResult,
    lifetime: resourceLifetimeResult,
    option: optionPresenceResult,
};
