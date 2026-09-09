import { createRequire } from "module";
let loaded = null;
const require_ = createRequire(import.meta.url);
function loadStack() {
    if (loaded !== null)
        return loaded;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { parseSync } = require_("oxc-parser");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { analyze } = require_("eslint-scope");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const keys = require_("eslint-visitor-keys");
        loaded = { parseSync, analyze, keys };
    }
    catch (e) {
        loaded = { error: `the analysis engine is not installed (${e instanceof Error ? e.message : String(e)}) — npm install oxc-parser` };
    }
    return loaded;
}
export function analysisStatus() {
    const stack = loadStack();
    return stack.error !== undefined ? { available: false, reason: stack.error } : { available: true };
}
// One file in, one identity model out: every binding (declarations,
// parameters, imports) with the span of its declaring node and every
// reference to it, read or write. Type-position identifiers never become
// references (eslint-scope only resolves value positions); TS-only
// declarations (enums, namespaces) are not modeled — declared blind-spot
// territory for checks that care.
export function analyzeBindings(file, source) {
    var _a;
    const stack = loadStack();
    if (stack.error !== undefined)
        return { ok: false, error: stack.error };
    let program;
    try {
        program = stack.parseSync(file, source, { sourceType: "module" }).program;
    }
    catch (e) {
        return { ok: false, error: `analysis failed to parse ${file}: ${e instanceof Error ? e.message : String(e)}` };
    }
    addRanges(program);
    let scopeManager;
    try {
        scopeManager = stack.analyze(program, {
            sourceType: "module",
            ecmaVersion: 2026,
            childVisitorKeys: stack.keys.KEYS,
        });
    }
    catch (e) {
        return { ok: false, error: `analysis failed to resolve scopes in ${file}: ${e instanceof Error ? e.message : String(e)}` };
    }
    const pos = positioner(source);
    const bindings = [];
    const global = scopeManager.globalScope;
    if (global === null)
        return { ok: false, error: `analysis failed to resolve scopes in ${file}` };
    for (const scope of allScopes(global)) {
        for (const variable of scope.variables) {
            const def = variable.defs[0];
            if (def === undefined)
                continue; // builtins and implicit globals carry no def
            // The declaration's own extent: for variables the declarator (so a
            // binding's span contains its initializer), for parameters the
            // identifier itself (eslint-scope hands the whole function node for
            // params, which would swallow the body).
            const node = def.node;
            const span = def.type === "Parameter" ? def.name.range : ((_a = node === null || node === void 0 ? void 0 : node.range) !== null && _a !== void 0 ? _a : def.name.range);
            if (span === undefined)
                continue;
            bindings.push({
                name: variable.name,
                kind: def.type,
                line: pos.line(span[0]),
                column: pos.column(span[0]),
                endLine: pos.line(span[1]),
                endColumn: pos.column(span[1]),
                references: variable.references
                    .filter((r) => r.identifier.range !== undefined)
                    .map((r) => ({
                    line: pos.line(r.identifier.range[0]),
                    column: pos.column(r.identifier.range[0]),
                    endLine: pos.line(r.identifier.range[1]),
                    endColumn: pos.column(r.identifier.range[1]),
                    write: r.isWrite(),
                })),
            });
        }
    }
    return { ok: true, file: { file, bindings } };
}
// eslint-scope expects `range: [start, end]` on nodes; oxc emits start/end.
function addRanges(node) {
    if (!node || typeof node !== "object")
        return;
    const n = node;
    if (typeof n.start === "number" && typeof n.end === "number")
        n.range = [n.start, n.end];
    for (const key of Object.keys(n)) {
        if (key === "range" || key === "start" || key === "end")
            continue;
        const v = n[key];
        if (Array.isArray(v)) {
            for (const child of v)
                addRanges(child);
        }
        else if (v && typeof v === "object" && typeof v.type === "string") {
            addRanges(v);
        }
    }
}
function allScopes(scope, out = []) {
    out.push(scope);
    for (const child of scope.childScopes)
        allScopes(child, out);
    return out;
}
// Byte offset → ctx position conventions, one index per file.
function positioner(source) {
    const starts = [0];
    for (let i = 0; i < source.length; i += 1) {
        if (source[i] === "\n")
            starts.push(i + 1);
    }
    return {
        line: (offset) => lowerBound(starts, offset) + 1,
        column: (offset) => offset - starts[lowerBound(starts, offset)],
    };
}
function lowerBound(sorted, value) {
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (sorted[mid] <= value)
            lo = mid;
        else
            hi = mid - 1;
    }
    return lo;
}
