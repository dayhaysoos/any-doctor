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
        const { analyze } = require_("@typescript-eslint/scope-manager");
        loaded = { parseSync, analyze };
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
// One file in, every function-like span out (D26): an AST fact answering
// what the doctors' private brace-counting copies could only approximate.
// Semicolons inside multi-line callbacks, strings containing braces, JSX —
// none of it can truncate a span that the parser already knows. Named
// declarations carry their id; arrows and anonymous expressions carry null.
export function analyzeSpans(file, source) {
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
    const pos = positioner(source);
    const spans = [];
    const visit = (node) => {
        if (!node || typeof node !== "object")
            return;
        const n = node;
        let span = null;
        if (n.type === "FunctionDeclaration" || n.type === "TSDeclareFunction") {
            span = spanOf(n, "function", idName(n.id));
        }
        else if (n.type === "FunctionExpression") {
            span = spanOf(n, "function-expression", idName(n.id));
        }
        else if (n.type === "ArrowFunctionExpression") {
            span = spanOf(n, "arrow", null);
        }
        else if (n.type === "ClassDeclaration" || n.type === "ClassExpression") {
            span = spanOf(n, "class", idName(n.id));
        }
        else if (n.type === "MethodDefinition" || n.type === "TSAbstractMethodDefinition") {
            span = spanOf(n.value, "method", propertyName(n.key));
        }
        if (span !== null)
            spans.push(span);
        for (const key of Object.keys(n)) {
            if (key === "range" || key === "start" || key === "end")
                continue;
            const v = n[key];
            if (Array.isArray(v)) {
                for (const child of v)
                    if (isNode(child))
                        visit(child);
            }
            else if (isNode(v))
                visit(v);
        }
    };
    visit(program);
    return { ok: true, file: { file, spans } };
    function spanOf(n, kind, name) {
        if (typeof n.start !== "number" || typeof n.end !== "number")
            return null;
        return {
            kind,
            name,
            async: n.async === true,
            line: pos.line(n.start),
            column: pos.column(n.start),
            endLine: pos.line(n.end),
            endColumn: pos.column(n.end),
        };
    }
}
function idName(id) {
    return id && typeof id.name === "string" ? id.name : null;
}
function propertyName(key) {
    const k = key;
    if (k && typeof k.name === "string")
        return k.name;
    if (k && typeof k.value === "string")
        return k.value; // computed / literal keys
    return null;
}
function isNode(v) {
    return Boolean(v) && typeof v === "object" && typeof v.type === "string";
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
    // Language facts computed from the AST once, so doctors never re-derive
    // them with regexes: what is exported, and what is an intentional
    // object-rest exclusion.
    const facts = languageFacts(program);
    for (const scope of allScopes(global)) {
        for (const variable of scope.variables) {
            const def = variable.defs[0];
            if (def === undefined)
                continue; // builtins and implicit globals carry no def
            // The declaration's own extent: for variables the declarator (so a
            // binding's span contains its initializer), for parameters the
            // identifier itself (scope managers hand the whole function node for
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
                exported: facts.exported.has(variable.name) || undefined,
                excluded: facts.excluded.has(variable.name) || undefined,
            });
        }
    }
    return { ok: true, file: { file, bindings } };
}
function languageFacts(program) {
    const exported = new Set();
    const excluded = new Set();
    const visit = (node) => {
        if (!node || typeof node !== "object")
            return;
        const n = node;
        if (n.type === "ExportNamedDeclaration" && n.declaration) {
            collectDeclaredNames(n.declaration, exported);
        }
        if (n.type === "ExportNamedDeclaration" && Array.isArray(n.specifiers)) {
            for (const spec of n.specifiers) {
                if (spec.local && typeof spec.local.name === "string") {
                    exported.add(spec.local.name);
                }
            }
        }
        if (n.type === "ExportDefaultDeclaration") {
            const d = n.declaration;
            if (d && typeof d.id === "object" && d.id && typeof d.id.name === "string") {
                exported.add(d.id.name);
            }
        }
        if (n.type === "ObjectPattern" && Array.isArray(n.properties)) {
            const hasRest = n.properties.some((p) => p.type === "RestElement");
            if (hasRest) {
                for (const p of n.properties) {
                    if (p.type === "Property" && p.value && p.value.type === "Identifier") {
                        excluded.add(p.value.name);
                    }
                }
            }
        }
        for (const key of Object.keys(n)) {
            if (key === "range" || key === "start" || key === "end" || key === "tokens" || key === "comments")
                continue;
            const v = n[key];
            if (Array.isArray(v)) {
                for (const child of v) {
                    if (child && typeof child === "object" && typeof child.type === "string")
                        visit(child);
                }
            }
            else if (v && typeof v === "object" && typeof v.type === "string") {
                visit(v);
            }
        }
    };
    visit(program);
    return { exported, excluded };
}
// Every name a declaration binds: function/class ids, every declarator of
// a variable statement (multi-declarator, destructured patterns), and the
// property names of nested object/array patterns.
function collectDeclaredNames(decl, into) {
    if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration" || decl.type === "TSDeclareFunction") {
        if (decl.id && typeof decl.id.name === "string") {
            into.add(decl.id.name);
        }
        return;
    }
    if (decl.type === "VariableDeclaration" && Array.isArray(decl.declarations)) {
        for (const d of decl.declarations) {
            collectPatternNames(d.id, into);
        }
    }
}
function collectPatternNames(pattern, into) {
    var _a, _b;
    if (pattern.type === "Identifier") {
        into.add(pattern.name);
        return;
    }
    if ((pattern.type === "ObjectPattern" || pattern.type === "ArrayPattern") && Array.isArray((_a = pattern.properties) !== null && _a !== void 0 ? _a : pattern.elements)) {
        const items = ((_b = pattern.properties) !== null && _b !== void 0 ? _b : pattern.elements);
        for (const item of items) {
            if (!item)
                continue;
            if (item.type === "Property")
                collectPatternNames(item.value, into);
            else if (item.type === "RestElement")
                collectPatternNames(item.argument, into);
            else
                collectPatternNames(item, into);
        }
    }
    if (pattern.type === "AssignmentPattern")
        collectPatternNames(pattern.left, into);
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
