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
function parseProgram(stack, file, source) {
    if (stack.error !== undefined)
        return { ok: false, error: stack.error };
    try {
        const parsed = stack.parseSync(file, source, { sourceType: "module" });
        if (parsed.errors !== undefined && parsed.errors.length > 0) {
            return { ok: false, error: `analysis failed to parse ${file}: ${parsed.errors[0].message}` };
        }
        const program = parsed.program;
        addRanges(program);
        return { ok: true, program };
    }
    catch (e) {
        return { ok: false, error: `analysis failed to parse ${file}: ${e instanceof Error ? e.message : String(e)}` };
    }
}
export function analyzeSpans(file, source) {
    const stack = loadStack();
    if (stack.error !== undefined)
        return { ok: false, error: stack.error };
    const parsed = parseProgram(stack, file, source);
    if (!parsed.ok)
        return { ok: false, error: parsed.error };
    const program = parsed.program;
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
    const parsed = parseProgram(stack, file, source);
    if (!parsed.ok)
        return { ok: false, error: parsed.error };
    const program = parsed.program;
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
    if (["ClassDeclaration", "ClassExpression", "MethodDefinition", "PropertyDefinition", "AccessorProperty"].includes(String(n.type)) && n.decorators === undefined)
        n.decorators = [];
    if (["ClassDeclaration", "ClassExpression"].includes(String(n.type)) && n.implements === undefined)
        n.implements = [];
    // OXC omits parameter decorators in JS; the TS scope adapter expects an array.
    if (Array.isArray(n.params))
        for (const param of n.params) {
            if (isNode(param) && param.decorators === undefined)
                param.decorators = [];
        }
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
// Call relationships and receiver identities are language facts. The doctor
// decides which imported factory and methods belong to its framework.
export function analyzeCalls(file, source) {
    var _a, _b;
    const stack = loadStack();
    if (stack.error !== undefined)
        return { ok: false, error: stack.error };
    const parsed = parseProgram(stack, file, source);
    if (!parsed.ok)
        return { ok: false, error: parsed.error };
    const program = parsed.program;
    try {
        const manager = stack.analyze(program, { sourceType: "module" });
        const positions = positioner(source);
        const parents = new Map();
        const nodes = [];
        const walk = (n, parent) => {
            if (parent)
                parents.set(n, parent);
            nodes.push(n);
            for (const [key, value] of Object.entries(n)) {
                if (key === "comments" || key === "tokens")
                    continue;
                if (isNode(value))
                    walk(value, n);
                else if (Array.isArray(value))
                    for (const item of value)
                        if (isNode(item))
                            walk(item, n);
            }
        };
        walk(program);
        const identities = new Map();
        for (const scope of manager.scopes)
            for (const variable of scope.variables) {
                const def = variable.defs[0];
                if (!def || !def.name.range)
                    continue;
                const info = {
                    binding: def.name.range[0], written: variable.references.some(r => r.isWrite() && !r.init),
                };
                if (def.type === "ImportBinding" && def.parent.type === "ImportDeclaration") {
                    info.source = String(def.parent.source.value);
                    const spec = def.node;
                    info.importedName = spec.type === "ImportNamespaceSpecifier" ? "*"
                        : spec.type === "ImportDefaultSpecifier" ? "default" : (_a = propertyName(spec.imported)) !== null && _a !== void 0 ? _a : undefined;
                }
                identities.set(def.name, info);
                for (const ref of variable.references)
                    identities.set(ref.identifier, info);
            }
        const range = (n) => {
            const [start, end] = n.range;
            return { start, end, line: positions.line(start), column: positions.column(start), endLine: positions.line(end), endColumn: positions.column(end) };
        };
        const unwrap = (n) => {
            while (TRANSPARENT_EXPRESSIONS.has(n.type) && isNode(n.expression))
                n = n.expression;
            return n;
        };
        const outer = (n) => {
            let p = parents.get(n);
            while (p && TRANSPARENT_EXPRESSIONS.has(p.type)) {
                n = p;
                p = parents.get(n);
            }
            return n;
        };
        const target = (expr) => {
            var _a;
            let n = unwrap(expr);
            const members = [];
            while (n.type === "MemberExpression" && !n.computed && isNode(n.object) && isNode(n.property)) {
                const name = idName(n.property);
                if (!name)
                    break;
                members.unshift(name);
                n = unwrap(n.object);
            }
            if (n.type !== "Identifier")
                return { root: null, members, binding: null };
            const identity = identities.get(n);
            return { root: idName(n), members, binding: (_a = identity === null || identity === void 0 ? void 0 : identity.binding) !== null && _a !== void 0 ? _a : null,
                ...((identity === null || identity === void 0 ? void 0 : identity.written) ? { reassigned: true } : {}),
                ...((identity === null || identity === void 0 ? void 0 : identity.source) && !identity.written ? { source: identity.source, importedName: identity.importedName } : {}) };
        };
        const functionStart = (n) => {
            let p = parents.get(n);
            while (p) {
                if (FUNCTION_EXPRESSIONS.has(p.type))
                    return p.range[0];
                p = parents.get(p);
            }
            return null;
        };
        const functions = [];
        const calls = [];
        const differences = [];
        const operand = (n) => {
            n = unwrap(n);
            if (n.type === "CallExpression")
                return { call: n.range[0] };
            const identity = identities.get(n);
            return identity && !identity.written ? { binding: identity.binding } : {};
        };
        for (const n of nodes) {
            if (FUNCTION_EXPRESSIONS.has(n.type)) {
                const f = { ...range(n), parameters: n.params.map(p => { var _a, _b; return (_b = (_a = identities.get(p)) === null || _a === void 0 ? void 0 : _a.binding) !== null && _b !== void 0 ? _b : null; }) };
                let child = outer(n), parent = parents.get(child), property = null;
                if ((parent === null || parent === void 0 ? void 0 : parent.type) === "Property" && parent.value === child && !parent.computed) {
                    property = propertyName(parent.key);
                    child = parents.get(parent);
                    parent = parents.get(child);
                }
                if ((parent === null || parent === void 0 ? void 0 : parent.type) === "CallExpression" && Array.isArray(parent.arguments)) {
                    const argument = parent.arguments.indexOf(child);
                    if (argument >= 0)
                        f.registration = { target: target(parent.callee), property, argument };
                }
                functions.push(f);
            }
            if (n.type === "CallExpression") {
                const child = outer(n), parent = parents.get(child);
                const usage = (parent === null || parent === void 0 ? void 0 : parent.type) === "ExpressionStatement" ? "discarded"
                    : (parent === null || parent === void 0 ? void 0 : parent.type) === "AwaitExpression" ? "awaited"
                        : (parent === null || parent === void 0 ? void 0 : parent.type) === "ReturnStatement" || ((parent === null || parent === void 0 ? void 0 : parent.type) === "ArrowFunctionExpression" && parent.body === child) ? "returned"
                            : (parent === null || parent === void 0 ? void 0 : parent.type) === "VariableDeclarator" || (parent === null || parent === void 0 ? void 0 : parent.type) === "AssignmentExpression" ? "stored"
                                : (parent === null || parent === void 0 ? void 0 : parent.type) === "CallExpression" && parent.arguments.includes(child) ? "passed" : "unknown";
                const call = { ...range(n), target: target(n.callee), usage, functionStart: functionStart(n), arguments: n.arguments.map(range) };
                if ((parent === null || parent === void 0 ? void 0 : parent.type) === "VariableDeclarator" && parent.init === child && ((_b = parents.get(parent)) === null || _b === void 0 ? void 0 : _b.kind) === "const") {
                    const id = identities.get(parent.id);
                    if (id && !id.written)
                        call.resultBinding = id.binding;
                }
                const callee = unwrap(n.callee);
                if (callee.type === "MemberExpression" && isNode(callee.object)) {
                    if (isNode(callee.property))
                        call.memberRange = range(callee.property);
                    const receiver = unwrap(callee.object);
                    if (receiver.type === "CallExpression")
                        call.receiverCall = receiver.range[1];
                }
                calls.push(call);
            }
            if (n.type === "BinaryExpression" && n.operator === "-")
                differences.push({
                    ...range(n), functionStart: functionStart(n), left: operand(n.left), right: operand(n.right),
                });
        }
        return { ok: true, file: { file, calls, functions, differences } };
    }
    catch (e) {
        return { ok: false, error: `analysis failed for ${file}: ${e instanceof Error ? e.message : String(e)}` };
    }
}
const FUNCTION_EXPRESSIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const TRANSPARENT_EXPRESSIONS = new Set(["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression", "TSSatisfiesExpression", "ChainExpression", "ParenthesizedExpression"]);
