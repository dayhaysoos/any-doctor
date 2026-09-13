import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { analyzeSyntax } from "./analysis.js";
import { children } from "./function-structure.js";
import { inventory, readAnalysisConfig, matchesPath, } from "./file-scope.js";
const codeExtensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".mts",
    ".cts",
    ".cjs",
];
const nodeName = (n) => { var _a, _b; return String((_b = (_a = n === null || n === void 0 ? void 0 : n.name) !== null && _a !== void 0 ? _a : n === null || n === void 0 ? void 0 : n.value) !== null && _b !== void 0 ? _b : ""); };
const literal = (n) => typeof (n === null || n === void 0 ? void 0 : n.value) === "string"
    ? n.value
    : undefined;
// These wrappers erase at runtime. Type syntax is never evidence of a loader.
function runtimeExpression(node) {
    while (["ParenthesizedExpression", "TSAsExpression", "TSTypeAssertion",
        "TSNonNullExpression", "TSSatisfiesExpression", "TSInstantiationExpression"].includes(node.type))
        node = node.expression;
    return node;
}
function staticProperty(node) {
    const property = runtimeExpression(node.property);
    return node.computed ? literal(property) : nodeName(property);
}
const loaderRelated = (value) => !["loaded-value", "non-loader", "unrelated"].includes(value.kind);
/** One graph per SDK scan. All reads are captured before graph construction. */
export function projectConsumers(root) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const started = performance.now();
    const config = readAnalysisConfig(root);
    const inv = inventory(root, [...codeExtensions, ".json"], config);
    const sources = new Map();
    for (const { file } of inv.files)
        sources.set(path.resolve(root, file), fs.readFileSync(path.resolve(root, file), "utf8"));
    const issues = new Set();
    const fileSet = new Set(sources.keys());
    const directories = new Set([root]);
    for (const file of fileSet) {
        let dir = path.dirname(file);
        while (dir.startsWith(root)) {
            directories.add(dir);
            if (dir === root)
                break;
            dir = path.dirname(dir);
        }
    }
    const read = (file) => sources.get(path.resolve(file));
    const host = {
        fileExists: (f) => fileSet.has(path.resolve(f)),
        readFile: read,
        directoryExists: (d) => directories.has(path.resolve(d)),
        getCurrentDirectory: () => root,
        realpath: (f) => f,
    };
    const optionsCache = new Map();
    const configIssues = new Map();
    const unboundedConfigTargets = new Map();
    function options(file) {
        var _a, _b, _c;
        let dir = path.dirname(path.resolve(root, file));
        while (dir !== root && !sources.has(path.join(dir, "tsconfig.json")))
            dir = path.dirname(dir);
        if (optionsCache.has(dir))
            return optionsCache.get(dir);
        const raw = sources.get(path.join(dir, "tsconfig.json"));
        let opts = {
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            module: ts.ModuleKind.ESNext,
            allowJs: true,
        };
        if (raw !== undefined) {
            const parsed = ts.parseConfigFileTextToJson(path.join(dir, "tsconfig.json"), raw);
            const result = ts.parseJsonConfigFileContent((_a = parsed.config) !== null && _a !== void 0 ? _a : {}, {
                useCaseSensitiveFileNames: true,
                fileExists: host.fileExists,
                readFile: read,
                readDirectory: () => [],
            }, dir, undefined, path.join(dir, "tsconfig.json"));
            const errors = [
                ...(parsed.error ? [parsed.error] : []),
                ...result.errors.filter((e) => e.code !== 18003),
            ];
            if ((_c = (_b = parsed.config) === null || _b === void 0 ? void 0 : _b.references) === null || _c === void 0 ? void 0 : _c.length)
                errors.push({
                    category: ts.DiagnosticCategory.Error,
                    code: 0,
                    file: undefined,
                    start: undefined,
                    length: undefined,
                    messageText: "project references are not followed; nearest tsconfig.json only",
                });
            if (errors.length)
                configIssues.set(dir, errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, " ")));
            opts = { ...opts, ...result.options };
            if (![
                ts.ModuleResolutionKind.Bundler,
                ts.ModuleResolutionKind.Node10,
                ts.ModuleResolutionKind.Node16,
                ts.ModuleResolutionKind.NodeNext,
            ].includes(opts.moduleResolution)) {
                configIssues.set(dir, [
                    "unsupported moduleResolution; supported: node10, node16, nodenext, bundler",
                ]);
            }
        }
        optionsCache.set(dir, opts);
        return opts;
    }
    const modules = new Map();
    const origins = new Map();
    const originFile = new Map();
    const originDeclaration = new Map();
    const localOrigin = new Map();
    const packages = new Map();
    for (const [abs, source] of sources) {
        if (path.basename(abs) !== "package.json")
            continue;
        try {
            const data = JSON.parse(source);
            if (typeof data.name === "string")
                packages.set(data.name, { dir: path.dirname(abs), data });
        }
        catch {
            throw new Error(`invalid package.json: ${path.relative(root, abs)}`);
        }
    }
    function resolve(specifier, from, typeOnly = false) {
        var _a, _b, _c, _d;
        const opts = options(from);
        let resolutionMode = ts.ModuleKind.ESNext;
        if (opts.moduleResolution === ts.ModuleResolutionKind.Node16 ||
            opts.moduleResolution === ts.ModuleResolutionKind.NodeNext) {
            if (/\.[cm][jt]s$/.test(from))
                resolutionMode = /\.c[jt]s$/.test(from)
                    ? ts.ModuleKind.CommonJS
                    : ts.ModuleKind.ESNext;
            else {
                let dir = path.dirname(path.resolve(root, from));
                while (dir !== root && !sources.has(path.join(dir, "package.json")))
                    dir = path.dirname(dir);
                const raw = sources.get(path.join(dir, "package.json"));
                resolutionMode =
                    raw && JSON.parse(raw).type === "module"
                        ? ts.ModuleKind.ESNext
                        : ts.ModuleKind.CommonJS;
            }
        }
        // An unavailable inherited config can redirect bare specifiers anywhere in
        // the capture. The importing config's directory is not a target boundary.
        const configDir = (_a = [...optionsCache].find(([, value]) => value === opts)) === null || _a === void 0 ? void 0 : _a[0];
        if (configDir && configIssues.has(configDir) &&
            !specifier.startsWith(".") && !specifier.startsWith("/") &&
            !specifier.startsWith("node:")) {
            const detail = `unsupported config leaves target scope of ${specifier} unbounded`;
            issues.add(`${from}: ${detail}`);
            unboundedConfigTargets.set(from + "\0" + specifier, { from, detail });
        }
        const result = ts.resolveModuleName(specifier, path.resolve(root, from), opts, host, undefined, undefined, resolutionMode).resolvedModule;
        if (result && modules.has(path.relative(root, result.resolvedFileName)))
            return path.relative(root, result.resolvedFileName);
        const packageName = specifier.startsWith("@")
            ? specifier.split("/").slice(0, 2).join("/")
            : specifier.split("/")[0];
        const pkg = packages.get(packageName);
        if (pkg) {
            const sub = specifier.slice(packageName.length), exports = pkg.data.exports;
            let entry = exports;
            if (exports &&
                typeof exports === "object" &&
                !Array.isArray(exports) &&
                Object.keys(exports).some((k) => k.startsWith(".")))
                entry = exports[sub ? "." + sub : "."];
            if (entry === undefined && exports === undefined)
                entry = sub
                    ? "." + sub
                    : ((_c = (_b = pkg.data.module) !== null && _b !== void 0 ? _b : pkg.data.main) !== null && _c !== void 0 ? _c : "./index");
            while (entry && typeof entry === "object" && !Array.isArray(entry)) {
                const map = entry;
                entry =
                    (_d = (typeOnly
                        ? map.types
                        : resolutionMode === ts.ModuleKind.CommonJS
                            ? map.require
                            : map.import)) !== null && _d !== void 0 ? _d : map.default;
            }
            if (typeof entry === "string" && entry.startsWith(".")) {
                const rel = "./" +
                    path.relative(path.dirname(path.resolve(root, from)), path.resolve(pkg.dir, entry));
                const resolved = ts.resolveModuleName(rel, path.resolve(root, from), opts, host).resolvedModule;
                if (resolved &&
                    modules.has(path.relative(root, resolved.resolvedFileName)))
                    return path.relative(root, resolved.resolvedFileName);
            }
            issues.add(`${from}: unsupported or unavailable workspace entry ${specifier}`);
            uncertainScope(path.relative(root, pkg.dir), from, 1, `unresolved workspace entry ${specifier}`);
        }
        if (specifier.startsWith(".") ||
            specifier.startsWith("/") ||
            (opts.paths &&
                Object.keys(opts.paths).some((p) => matchesPath(specifier, p)))) {
            issues.add(`${from}: unresolved internal module ${specifier}`);
        }
        return undefined;
    }
    function add(id, ev) {
        var _a;
        const list = (_a = origins.get(id)) === null || _a === void 0 ? void 0 : _a.evidence;
        if (list && !list.some((e) => JSON.stringify(e) === JSON.stringify(ev)))
            list.push(ev);
    }
    function targetEvidence(target, name, ev) {
        var _a;
        const m = modules.get(target);
        if (!m)
            return;
        const ids = name === "*"
            ? [...m.exports.values()].flatMap((s) => [...s])
            : [...((_a = m.exports.get(name)) !== null && _a !== void 0 ? _a : [])];
        const uncertainRoute = (module, exported, seen = new Set()) => {
            var _a, _b;
            const key = module.file + ":" + exported;
            if (seen.has(key))
                return false;
            seen.add(key);
            if (((_b = (_a = module.exports.get(exported)) === null || _a === void 0 ? void 0 : _a.size) !== null && _b !== void 0 ? _b : 0) > 1)
                return true;
            return module.links
                .filter((link) => link.exported === exported ||
                (link.exported === "*" &&
                    !explicitExports.get(module.file).has(exported) &&
                    modules.get(link.target).exports.has(exported)))
                .some((link) => link.typeOnly ||
                (link.exported !== "*" && link.imported === "*") ||
                uncertainRoute(modules.get(link.target), link.exported === "*" ? exported : link.imported, seen));
        };
        const bounded = (ev.kind === "runtime" || ev.kind === "test") &&
            name !== "*" &&
            uncertainRoute(m, name)
            ? {
                ...ev,
                kind: "uncertain",
                detail: "reference crosses an ambiguous, namespace, or type-only re-export; precise member flow is unsupported",
            }
            : ev;
        for (const id of ids)
            add(id, bounded);
    }
    function uncertainScope(prefix, from, line, detail) {
        for (const [id, file] of originFile)
            if (!prefix || file === prefix || file.startsWith(prefix + "/"))
                add(id, { kind: "uncertain", file: from, line, detail });
    }
    const lineOf = (m, n) => m.source.slice(0, n.start).split("\n").length;
    // Parse once and retain scope identities for the graph construction lifetime.
    for (const { file, role } of inv.files) {
        if (!codeExtensions.includes(path.extname(file)))
            continue;
        const source = sources.get(path.resolve(root, file));
        const { program, scopes } = analyzeSyntax(file, source);
        modules.set(file, {
            file,
            source,
            role,
            program,
            scopes,
            exports: new Map(),
            links: [],
        });
    }
    function origin(m, name, exported, n) {
        let locals = localOrigin.get(m.file);
        if (!locals)
            localOrigin.set(m.file, (locals = new Map()));
        let id = locals.get(name);
        if (!id) {
            id = m.file + ":" + String(n.start) + ":" + name;
            locals.set(name, id);
            const start = n.start;
            const lines = m.source.slice(0, start).split("\n");
            origins.set(id, {
                name,
                exportedNames: [],
                line: lines.length,
                column: lines.at(-1).length,
                evidence: [],
            });
            originFile.set(id, m.file);
            const declaration = declarationsAt(m.program, name);
            if (declaration !== undefined)
                originDeclaration.set(id, declaration);
        }
        origins.get(id).exportedNames.push(exported);
        m.exports.set(exported, new Set([id]));
    }
    for (const m of modules.values()) {
        const top = children(m.program);
        const declarations = new Map();
        const imports = new Map();
        const gather = (n) => {
            if (n.type === "Identifier")
                declarations.set(String(n.name), n);
            else if (n.type === "ObjectPattern" ||
                n.type === "ArrayPattern" ||
                n.type === "Property" ||
                n.type === "RestElement" ||
                n.type === "AssignmentPattern") {
                if (n.type === "Property")
                    gather(n.value);
                else if (n.type === "AssignmentPattern")
                    gather(n.left);
                else
                    children(n).forEach(gather);
            }
        };
        for (const stmt of top) {
            const d = (_a = stmt.declaration) !== null && _a !== void 0 ? _a : stmt;
            if (d.id)
                gather(d.id);
            if (d.type === "VariableDeclaration")
                for (const decl of d.declarations)
                    gather(decl.id);
            if (stmt.type === "ImportDeclaration")
                for (const s of stmt.specifiers)
                    imports.set(nodeName(s.local), {
                        specifier: literal(stmt.source),
                        name: s.type === "ImportDefaultSpecifier"
                            ? "default"
                            : s.type === "ImportNamespaceSpecifier"
                                ? "*"
                                : nodeName(s.imported),
                        typeOnly: stmt.importKind === "type" || s.importKind === "type",
                    });
        }
        for (const stmt of top) {
            if (stmt.type === "ExportNamedDeclaration") {
                const d = stmt.declaration;
                if (d) {
                    if (d.id)
                        origin(m, nodeName(d.id), nodeName(d.id), d);
                    if (d.type === "VariableDeclaration") {
                        const names = new Set();
                        const collect = (n) => {
                            if (n.type === "Identifier")
                                names.add(String(n.name));
                            else if (n.type === "Property")
                                collect(n.value);
                            else if (n.type === "AssignmentPattern")
                                collect(n.left);
                            else
                                children(n).forEach(collect);
                        };
                        for (const decl of d.declarations) {
                            names.clear();
                            collect(decl.id);
                            for (const name of names)
                                origin(m, name, name, decl);
                        }
                    }
                }
                for (const s of ((_b = stmt.specifiers) !== null && _b !== void 0 ? _b : [])) {
                    const local = nodeName(s.local), exported = nodeName(s.exported), imp = imports.get(local);
                    const spec = (_c = literal(stmt.source)) !== null && _c !== void 0 ? _c : imp === null || imp === void 0 ? void 0 : imp.specifier;
                    if (spec) {
                        const target = resolve(spec, m.file, stmt.exportKind === "type" || s.exportKind === "type");
                        if (target)
                            m.links.push({
                                target,
                                imported: literal(stmt.source) ? local : imp.name,
                                exported,
                                typeOnly: stmt.exportKind === "type" ||
                                    s.exportKind === "type" ||
                                    (imp === null || imp === void 0 ? void 0 : imp.typeOnly) === true,
                                line: lineOf(m, stmt),
                            });
                    }
                    else {
                        const decl = declarations.get(local);
                        if (decl)
                            origin(m, local, exported, decl);
                    }
                }
            }
            else if (stmt.type === "ExportDefaultDeclaration") {
                const d = stmt.declaration;
                const name = d.type === "Identifier" ? nodeName(d) : nodeName(d.id);
                const imp = imports.get(name);
                if (d.type === "Identifier" && imp) {
                    const target = resolve(imp.specifier, m.file, imp.typeOnly);
                    if (target)
                        m.links.push({
                            target,
                            imported: imp.name,
                            exported: "default",
                            typeOnly: imp.typeOnly,
                            line: lineOf(m, stmt),
                        });
                }
                else
                    origin(m, name || "default", "default", (_d = declarations.get(name)) !== null && _d !== void 0 ? _d : d);
            }
            else if (stmt.type === "ExportAllDeclaration") {
                const target = resolve(literal(stmt.source), m.file, stmt.exportKind === "type");
                if (target)
                    m.links.push({
                        target,
                        imported: "*",
                        exported: stmt.exported ? nodeName(stmt.exported) : "*",
                        typeOnly: stmt.exportKind === "type",
                        line: lineOf(m, stmt),
                    });
            }
        }
    }
    const explicitExports = new Map([...modules].map(([file, m]) => [
        file,
        new Set([
            ...m.exports.keys(),
            ...m.links.filter((l) => l.exported !== "*").map((l) => l.exported),
        ]),
    ]));
    // Monotone finite sets terminate barrel cycles, including star chains.
    let changed = true;
    while (changed) {
        changed = false;
        for (const m of modules.values())
            for (const link of m.links) {
                const target = modules.get(link.target);
                const entries = link.imported === "*"
                    ? [...target.exports].filter(([name]) => name !== "default")
                    : [
                        [
                            link.imported,
                            (_e = target.exports.get(link.imported)) !== null && _e !== void 0 ? _e : new Set(),
                        ],
                    ];
                for (const [name, ids] of entries) {
                    if (link.exported === "*" && explicitExports.get(m.file).has(name))
                        continue;
                    const exported = link.exported === "*" ? name : link.exported;
                    const set = (_f = m.exports.get(exported)) !== null && _f !== void 0 ? _f : new Set();
                    for (const id of ids)
                        if (!set.has(id)) {
                            set.add(id);
                            changed = true;
                        }
                    m.exports.set(exported, set);
                }
            }
    }
    for (const m of modules.values())
        for (const link of m.links)
            targetEvidence(link.target, link.imported, {
                kind: "reexport",
                file: m.file,
                line: link.line,
                detail: `${link.typeOnly ? "type " : ""}re-export as ${link.exported}; dependency even without a final caller`,
            });
    for (const m of modules.values()) {
        options(m.file);
        const parent = new Map();
        const visit = (n) => {
            for (const child of children(n)) {
                parent.set(child, n);
                visit(child);
            }
        };
        visit(m.program);
        // Scope-manager references bind these AST identifiers to their declarations.
        const references = new Map(m.scopes.scopes.flatMap((scope) => scope.references).map((ref) => [ref.identifier, ref]));
        const variableOf = (n) => { var _a; return (_a = references.get(n)) === null || _a === void 0 ? void 0 : _a.resolved; };
        const fixedSegment = (n) => {
            var _a;
            let value = literal(n);
            if (n.type === "Identifier") {
                const variable = variableOf(n), def = variable === null || variable === void 0 ? void 0 : variable.defs[0];
                const declaration = def === null || def === void 0 ? void 0 : def.node;
                if ((def === null || def === void 0 ? void 0 : def.type) !== "Variable" ||
                    ((_a = def.parent) === null || _a === void 0 ? void 0 : _a.kind) !== "const" ||
                    (declaration === null || declaration === void 0 ? void 0 : declaration.id) !== def.name ||
                    (variable === null || variable === void 0 ? void 0 : variable.references.some((ref) => ref.isWrite() && !ref.init)))
                    return false;
                value = literal(declaration.init);
            }
            // Conservative segment alphabet: no separators, dot segments, percent
            // encodings, URL delimiters, or coercions that might change containment.
            return value !== undefined && /^[A-Za-z0-9_-]+$/.test(value);
        };
        // Unknown calls without loader provenance are unrelated, not proven ordinary
        // functions and not incomplete loader analyses. Only related values abstain.
        const unsupported = (reason, role = "unknown", base) => ({ kind: "unsupported", role, reason, base });
        const runtimeParent = (node) => {
            let p = parent.get(node);
            while (p && runtimeExpression(p) === runtimeExpression(node)) {
                node = p;
                p = parent.get(node);
            }
            return p;
        };
        const modifiedObject = (variable, objectOnly) => variable.references.some((ref) => {
            const n = ref.identifier;
            const p = runtimeParent(n);
            if ((p === null || p === void 0 ? void 0 : p.type) === "MemberExpression") {
                const outer = runtimeParent(p);
                return ((outer === null || outer === void 0 ? void 0 : outer.type) === "AssignmentExpression" && runtimeExpression(outer.left) === p) ||
                    (outer === null || outer === void 0 ? void 0 : outer.type) === "UpdateExpression" ||
                    ((outer === null || outer === void 0 ? void 0 : outer.type) === "UnaryExpression" && outer.operator === "delete");
            }
            // Passing the object to unknown code can mutate its factory property.
            // Alias initialization is also an escape: aliases may mutate the object.
            return ((p === null || p === void 0 ? void 0 : p.type) === "CallExpression" && runtimeExpression(p.callee) !== n) ||
                (objectOnly && (p === null || p === void 0 ? void 0 : p.type) === "VariableDeclarator" && p.init !== undefined && runtimeExpression(p.init) === n);
        });
        const isImporterBase = (node) => {
            const base = runtimeExpression(node);
            if (base.type !== "MemberExpression" || staticProperty(base) !== "url")
                return false;
            const meta = runtimeExpression(base.object);
            return meta.type === "MetaProperty" && nodeName(meta.meta) === "import" &&
                nodeName(meta.property) === "meta";
        };
        const loaderValueCache = new Map();
        let cycleCount = 0;
        const classifyLoaderValue = (expression, seen = new Set()) => {
            const n = runtimeExpression(expression);
            if (seen.has(n)) {
                cycleCount++;
                return { kind: "unrelated" };
            }
            const cached = loaderValueCache.get(n);
            if (cached)
                return cached;
            const before = cycleCount;
            const value = classifyUncached(n, seen);
            // A recursive fallback is contextual; never cache it as proof of absence.
            if (cycleCount === before)
                loaderValueCache.set(n, value);
            return value;
        };
        const classifyUncached = (n, seen) => {
            var _a;
            const next = new Set(seen).add(n);
            if (n.type === "Identifier") {
                const variable = variableOf(n);
                if (!variable)
                    return references.has(n) && nodeName(n) === "require"
                        ? { kind: "loader", base: "importer" } : { kind: "unrelated" };
                const def = variable.defs[0], declaration = def === null || def === void 0 ? void 0 : def.node;
                let value = { kind: "unrelated" };
                if ((def === null || def === void 0 ? void 0 : def.type) === "ImportBinding" && declaration) {
                    const source = literal((_a = parent.get(declaration)) === null || _a === void 0 ? void 0 : _a.source);
                    if (source === "node:module" || source === "module") {
                        if (declaration.type === "ImportSpecifier" && nodeName(declaration.imported) === "createRequire")
                            value = { kind: "factory" };
                        else if (["ImportNamespaceSpecifier", "ImportDefaultSpecifier"].includes(declaration.type))
                            value = { kind: "module" };
                    }
                }
                else if ((def === null || def === void 0 ? void 0 : def.type) === "FunctionName")
                    value = { kind: "non-loader" };
                else if ((def === null || def === void 0 ? void 0 : def.type) === "Variable" && (declaration === null || declaration === void 0 ? void 0 : declaration.init)) {
                    if (next.has(declaration)) {
                        cycleCount++;
                        return { kind: "unrelated" };
                    }
                    next.add(declaration);
                    value = classifyLoaderValue(declaration.init, next);
                    if (declaration.id !== def.name && loaderRelated(value))
                        value = unsupported("loader-related destructuring is unsupported");
                }
                const writes = variable.references.filter((ref) => ref.isWrite() && !ref.init);
                if (writes.length && (loaderRelated(value) || writes.some((ref) => ref.writeExpr && loaderRelated(classifyLoaderValue(ref.writeExpr, next)))))
                    return unsupported("loader-related binding is reassigned; base and value flow are uncertain");
                if (["module", "factory", "loader"].includes(value.kind) && modifiedObject(variable, value.kind === "module"))
                    return unsupported("loader-related object or function is mutated or escapes; factory/base identity is uncertain");
                return value;
            }
            if (["FunctionExpression", "ArrowFunctionExpression", "Literal", "ObjectExpression", "ArrayExpression"].includes(n.type)) {
                if (["FunctionExpression", "ArrowFunctionExpression", "Literal"].includes(n.type))
                    return { kind: "non-loader" };
            }
            if (n.type === "MemberExpression") {
                const object = classifyLoaderValue(n.object, next);
                if (object.kind === "module") {
                    const property = staticProperty(n);
                    if (property === "createRequire")
                        return { kind: "factory" };
                    if (property === undefined)
                        return unsupported("computed builtin-module property may select createRequire");
                    return { kind: "unrelated" };
                }
                // An arbitrary member need not have the same callable role as its object.
                if (object.kind === "unsupported")
                    return unsupported(object.reason);
                // require.resolve computes a filename; it does not load module exports.
                // Keep this separate from invoking require, including through aliases.
                if (object.kind === "loader" && staticProperty(n) === "resolve")
                    return { kind: "non-loader" };
                if (loaderRelated(object))
                    return unsupported("unsupported member access on a loader-related value");
                return { kind: "unrelated" };
            }
            if (n.type === "ConditionalExpression" || n.type === "LogicalExpression") {
                const alternatives = (n.type === "ConditionalExpression"
                    ? [n.consequent, n.alternate] : [n.left, n.right]);
                const values = alternatives.map((value) => classifyLoaderValue(value, next));
                if (values.some(loaderRelated)) {
                    const role = values.every((value) => value.kind === "factory" ||
                        (value.kind === "unsupported" && value.role === "factory")) ? "factory" :
                        values.every((value) => value.kind === "loader" || value.kind === "non-loader" ||
                            (value.kind === "unsupported" && value.role === "loader")) ? "loader" : "unknown";
                    const base = role === "loader" && values.every((value) => value.kind === "loader" ||
                        value.kind === "non-loader" || (value.kind === "unsupported" && value.base === "importer"))
                        ? "importer" : undefined;
                    return unsupported("loader selection is conditional; value flow is unsupported", role, base);
                }
                return { kind: "unrelated" };
            }
            if (n.type === "CallExpression") {
                const callee = classifyLoaderValue(n.callee, next);
                if (callee.kind === "factory" || (callee.kind === "unsupported" && callee.role === "factory")) {
                    const base = n.arguments[0];
                    if (!base || !isImporterBase(base))
                        return unsupported("createRequire base is unsupported; possible target scope is unbounded", "loader");
                    if (callee.kind === "unsupported")
                        return unsupported(callee.reason, "loader", "importer");
                    return { kind: "loader", base: "importer" };
                }
                // Call-result semantics depend on role, not on recognition certainty.
                // The original load records its own target uncertainty in the AST walk;
                // its returned value and arbitrary methods do not inherit loader identity.
                if (callee.kind === "loader" || (callee.kind === "unsupported" && callee.role === "loader"))
                    return { kind: "loaded-value" };
                if (callee.kind === "unsupported")
                    return callee;
            }
            // Known loader provenance inside an unmodeled expression must survive.
            // Do not infer that an arbitrary wrapper returns its loader argument.
            if (children(n).filter((child) => !child.type.startsWith("TS") || runtimeExpression(child) !== child)
                .some((child) => loaderRelated(classifyLoaderValue(child, next))))
                return unsupported(`unsupported ${n.type} contains a loader-related value`);
            return { kind: "unrelated" };
        };
        const evidence = (n, typeOnly, detail) => ({
            kind: typeOnly ? "type" : m.role === "test" ? "test" : "runtime",
            file: m.file,
            line: lineOf(m, n),
            detail,
        });
        const namespace = (target, n, typeOnly) => {
            if (typeOnly) {
                targetEvidence(target, "*", evidence(n, true, "namespace referenced in a type position"));
                return;
            }
            const p = parent.get(n);
            const member = (p === null || p === void 0 ? void 0 : p.type) === "MemberExpression" ||
                (p === null || p === void 0 ? void 0 : p.type) === "OptionalMemberExpression" ||
                (p === null || p === void 0 ? void 0 : p.type) === "JSXMemberExpression";
            if (member &&
                p.object === n &&
                (!p.computed || literal(p.property) !== undefined))
                targetEvidence(target, nodeName(p.property), evidence(n, typeOnly, "resolved namespace member"));
            else
                targetEvidence(target, "*", {
                    kind: "uncertain",
                    file: m.file,
                    line: lineOf(m, n),
                    detail: "namespace escapes or has computed member access",
                });
        };
        for (const scope of m.scopes.scopes)
            for (const variable of scope.variables) {
                const def = variable.defs[0];
                if (!def)
                    continue;
                if (def.type === "ImportBinding") {
                    const spec = def.node;
                    const decl = parent.get(spec);
                    if ((decl === null || decl === void 0 ? void 0 : decl.type) !== "ImportDeclaration")
                        continue;
                    const typeOnly = decl.importKind === "type" || spec.importKind === "type";
                    const target = resolve(literal(decl.source), m.file, typeOnly);
                    if (!target)
                        continue;
                    if (spec.type !== "ImportNamespaceSpecifier")
                        targetEvidence(target, spec.type === "ImportDefaultSpecifier"
                            ? "default"
                            : nodeName(spec.imported), {
                            kind: typeOnly ? "type" : "import",
                            file: m.file,
                            line: lineOf(m, spec),
                            detail: "static named/default import dependency; not proof of runtime use",
                        });
                    for (const ref of variable.references) {
                        const n = ref.identifier;
                        const isType = typeOnly || !ref.isValueReference;
                        if (spec.type === "ImportNamespaceSpecifier")
                            namespace(target, n, isType);
                        else
                            targetEvidence(target, spec.type === "ImportDefaultSpecifier"
                                ? "default"
                                : nodeName(spec.imported), evidence(n, isType, "resolved imported binding reference"));
                    }
                }
                else {
                    // Identity-bound local reads, never same-spelled shadowed references.
                    const id = (_g = localOrigin.get(m.file)) === null || _g === void 0 ? void 0 : _g.get(variable.name);
                    if (!id)
                        continue;
                    const declaration = (_h = def.name.range) === null || _h === void 0 ? void 0 : _h[0];
                    const original = originDeclaration.get(id);
                    if (original === undefined || declaration !== original)
                        continue;
                    for (const ref of variable.references)
                        if (ref.isRead()) {
                            const p = parent.get(ref.identifier);
                            if ((p === null || p === void 0 ? void 0 : p.type) !== "ExportSpecifier" &&
                                (p === null || p === void 0 ? void 0 : p.type) !== "ExportDefaultDeclaration")
                                add(id, evidence(ref.identifier, !ref.isValueReference, "resolved in-file reference"));
                        }
                }
            }
        const walk = (n) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
            if (n.type === "ImportExpression") {
                const importSource = n.source;
                const spec = (_a = literal(importSource)) !== null && _a !== void 0 ? _a : (importSource.type === "TemplateLiteral" &&
                    importSource.expressions.length === 0
                    ? importSource.quasis[0].value
                        .cooked
                    : undefined);
                if (spec !== undefined) {
                    const target = resolve(spec, m.file);
                    if (target) {
                        let outer = n;
                        while (((_b = parent.get(outer)) === null || _b === void 0 ? void 0 : _b.type) === "AwaitExpression" ||
                            ((_c = parent.get(outer)) === null || _c === void 0 ? void 0 : _c.type) === "ParenthesizedExpression")
                            outer = parent.get(outer);
                        const p = parent.get(outer);
                        if (outer === n &&
                            (p === null || p === void 0 ? void 0 : p.type) === "MemberExpression" &&
                            nodeName(p.property) === "then") {
                            const call = parent.get(p), callback = (_d = call === null || call === void 0 ? void 0 : call.arguments) === null || _d === void 0 ? void 0 : _d[0], param = (_e = callback === null || callback === void 0 ? void 0 : callback.params) === null || _e === void 0 ? void 0 : _e[0];
                            const variable = (param === null || param === void 0 ? void 0 : param.type) === "Identifier"
                                ? m.scopes.scopes
                                    .flatMap((scope) => scope.variables)
                                    .find((v) => v.defs.some((def) => def.name === param))
                                : undefined;
                            if ((call === null || call === void 0 ? void 0 : call.type) === "CallExpression" && variable) {
                                for (const ref of variable.references)
                                    namespace(target, ref.identifier, !ref.isValueReference);
                            }
                            else
                                targetEvidence(target, "*", {
                                    kind: "uncertain",
                                    file: m.file,
                                    line: lineOf(m, n),
                                    detail: "dynamic import then-callback namespace is unsupported",
                                });
                        }
                        else if (outer !== n &&
                            (p === null || p === void 0 ? void 0 : p.type) === "MemberExpression" &&
                            p.object === outer)
                            namespace(target, outer, false);
                        else if (outer !== n &&
                            (p === null || p === void 0 ? void 0 : p.type) === "VariableDeclarator" &&
                            p.init === outer) {
                            const id = p.id;
                            if (id.type === "ObjectPattern") {
                                for (const property of id.properties) {
                                    if (property.type === "Property" &&
                                        (!property.computed || literal(property.key) !== undefined))
                                        targetEvidence(target, nodeName(property.key), evidence(property, false, "destructured dynamic import member"));
                                    else
                                        targetEvidence(target, "*", {
                                            kind: "uncertain",
                                            file: m.file,
                                            line: lineOf(m, n),
                                            detail: "dynamic import destructuring rest/computed access",
                                        });
                                }
                            }
                            else if (id.type === "Identifier") {
                                const variable = m.scopes.scopes
                                    .flatMap((scope) => scope.variables)
                                    .find((v) => v.defs.some((def) => def.name === id));
                                if (variable)
                                    for (const ref of variable.references) {
                                        if (ref.identifier === id)
                                            continue;
                                        if (ref.isWrite())
                                            targetEvidence(target, "*", {
                                                kind: "uncertain",
                                                file: m.file,
                                                line: lineOf(m, n),
                                                detail: "dynamic namespace binding reassigned",
                                            });
                                        else
                                            namespace(target, ref.identifier, !ref.isValueReference);
                                    }
                            }
                            else
                                targetEvidence(target, "*", {
                                    kind: "uncertain",
                                    file: m.file,
                                    line: lineOf(m, n),
                                    detail: "unsupported dynamic import binding",
                                });
                        }
                        else
                            targetEvidence(target, "*", {
                                kind: "uncertain",
                                file: m.file,
                                line: lineOf(m, n),
                                detail: "dynamic module namespace requires downstream value flow",
                            });
                    }
                }
                else {
                    const detail = "nonliteral dynamic import: possible consumers are unresolved";
                    issues.add(`${m.file}:${lineOf(m, n)} ${detail}`);
                    const src = n.source;
                    const quasi = (_f = src.quasis) === null || _f === void 0 ? void 0 : _f[0];
                    const prefix = src.type === "TemplateLiteral"
                        ? (_g = quasi === null || quasi === void 0 ? void 0 : quasi.value) === null || _g === void 0 ? void 0 : _g.cooked
                        : undefined;
                    const contained = src.type === "TemplateLiteral" &&
                        !/[%\\?#]/.test(prefix !== null && prefix !== void 0 ? prefix : "") &&
                        src.expressions.every(fixedSegment) &&
                        src.quasis.slice(1).every((quasi) => {
                            var _a;
                            return /^[A-Za-z0-9_.-]*$/.test((_a = quasi.value.cooked) !== null && _a !== void 0 ? _a : "!");
                        });
                    const scope = contained && (prefix === null || prefix === void 0 ? void 0 : prefix.startsWith("."))
                        ? path.relative(root, path.resolve(root, path.dirname(m.file), prefix.slice(0, prefix.lastIndexOf("/") + 1)))
                        : "";
                    uncertainScope(scope, m.file, lineOf(m, n), detail);
                }
            }
            else if (n.type === "TSImportEqualsDeclaration") {
                const spec = literal((_h = n.moduleReference) === null || _h === void 0 ? void 0 : _h.expression);
                const target = spec ? resolve(spec, m.file) : undefined;
                if (target)
                    targetEvidence(target, "*", {
                        kind: "uncertain",
                        file: m.file,
                        line: lineOf(m, n),
                        detail: "TypeScript import-equals value flow unsupported",
                    });
            }
            else if (n.type === "TSImportType") {
                const spec = (_k = (_j = literal(n.source)) !== null && _j !== void 0 ? _j : literal(n.argument)) !== null && _k !== void 0 ? _k : literal((_l = n.argument) === null || _l === void 0 ? void 0 : _l.literal);
                if (spec) {
                    const target = resolve(spec, m.file, true);
                    if (target)
                        targetEvidence(target, n.qualifier ? qualifierRoot(n.qualifier) : "*", evidence(n, true, "TypeScript import-type expression"));
                }
            }
            else if (n.type === "CallExpression") {
                const loader = classifyLoaderValue(n.callee);
                if (loader.kind === "loader" || (loader.kind === "unsupported" && loader.role !== "factory")) {
                    const argument = n.arguments[0];
                    const spec = loader.base === "importer" && argument
                        ? literal(runtimeExpression(argument)) : undefined;
                    const target = spec !== undefined ? resolve(spec, m.file) : undefined;
                    const detail = loader.kind === "unsupported" ? loader.reason :
                        spec === undefined ? "nonliteral CommonJS require target is unbounded" :
                            "CommonJS require value flow unsupported";
                    if (target)
                        targetEvidence(target, "*", {
                            kind: "uncertain", file: m.file, line: lineOf(m, n), detail,
                        });
                    else if (spec === undefined) {
                        issues.add(`${m.file}:${lineOf(m, n)} ${detail}`);
                        uncertainScope("", m.file, lineOf(m, n), detail);
                    }
                }
            }
            children(n).forEach(walk);
        };
        walk(m.program);
    }
    // Loader-owned defaults are exposure, never guesses about arbitrary directory helpers.
    for (const m of modules.values()) {
        if (/(^|\/)(?:vite|vitest)\.config\.[cm]?[jt]s$/.test(m.file))
            targetEvidence(m.file, "default", {
                kind: "public",
                file: m.file,
                line: 1,
                detail: "Vite/Vitest configuration default export convention",
            });
        const exported = children(m.program).find((n) => n.type === "ExportDefaultDeclaration");
        const call = exported === null || exported === void 0 ? void 0 : exported.declaration;
        if ((call === null || call === void 0 ? void 0 : call.type) === "CallExpression") {
            const ref = m.scopes.scopes
                .flatMap((scope) => scope.references)
                .find((ref) => ref.identifier === call.callee);
            const def = (_j = ref === null || ref === void 0 ? void 0 : ref.resolved) === null || _j === void 0 ? void 0 : _j.defs[0];
            const spec = def === null || def === void 0 ? void 0 : def.node;
            const declaration = children(m.program).find((n) => n.type === "ImportDeclaration" &&
                n.specifiers.includes(spec));
            if (spec &&
                ["definePlugin", "defineNitroPlugin"].includes(nodeName(spec.imported)) &&
                ["nitro", "nitropack/runtime"].includes((_k = literal(declaration === null || declaration === void 0 ? void 0 : declaration.source)) !== null && _k !== void 0 ? _k : ""))
                targetEvidence(m.file, "default", {
                    kind: "public",
                    file: m.file,
                    line: lineOf(m, exported),
                    detail: "Nitro runtime plugin wrapper: loader entry candidate, explicit loading remains project configuration",
                });
        }
    }
    // Explicitly supported loader conventions, additional entries are declarative.
    for (const m of modules.values())
        if (/^(?:src\/)?(?:index|main|cli|server|app|mod)\.[cm]?[jt]sx?$|^doctors\/.*\.mjs$/.test(m.file))
            targetEvidence(m.file, "*", {
                kind: "public",
                file: m.file,
                line: 1,
                detail: "supported root entry or doctor-loader convention",
            });
    // Configured framework/public entries and package entry declarations are exposure.
    for (const m of modules.values())
        if (config.entryPoints.some((p) => matchesPath(m.file, p)))
            targetEvidence(m.file, "*", {
                kind: "public",
                file: "any-doctor.analysis.json",
                line: 1,
                detail: "declared public/framework entry point",
            });
    for (const [abs, source] of sources)
        if (path.basename(abs) === "package.json") {
            const pkg = JSON.parse(source), dir = path.dirname(abs);
            const targets = [];
            const leaves = (v) => {
                if (typeof v === "string")
                    targets.push(v);
                else if (v && typeof v === "object")
                    Object.values(v).forEach(leaves);
            };
            for (const field of [
                pkg.exports,
                pkg.main,
                pkg.module,
                pkg.types,
                pkg.bin,
            ])
                leaves(field);
            for (const entry of targets) {
                const rel = path.relative(root, path.resolve(dir, entry));
                const selected = [...modules.keys()].filter((f) => matchesPath(f, rel));
                if (selected.length)
                    for (const file of selected)
                        targetEvidence(file, "*", {
                            kind: "public",
                            file: path.relative(root, abs),
                            line: 1,
                            detail: `package entry ${entry}`,
                        });
                else {
                    issues.add(`${path.relative(root, abs)}: entry ${entry} has no captured source mapping`);
                    uncertainScope(path.relative(root, dir), path.relative(root, abs), 1, `public entry ${entry} lacks source mapping`);
                }
            }
        }
    // Some resolutions happen before all export origins are collected.
    for (const { from, detail } of unboundedConfigTargets.values())
        uncertainScope("", from, 1, detail);
    for (const [dir, reasons] of configIssues)
        for (const reason of reasons) {
            issues.add(`${path.relative(root, dir) || "."}: ${reason}`);
            uncertainScope(path.relative(root, dir), path.relative(root, dir), 1, reason);
        }
    for (const origin of origins.values())
        for (const ev of origin.evidence)
            if (ev.kind === "uncertain")
                issues.add(`${ev.file}:${ev.line} ${ev.detail}`);
    const files = {};
    for (const file of modules.keys())
        files[file] = [];
    for (const [id, value] of origins)
        files[originFile.get(id)].push(value);
    const digest = createHash("sha256");
    const sourceDigests = {};
    let sourceBytes = 0;
    for (const [file, source] of sources) {
        digest
            .update(path.relative(root, file))
            .update("\0")
            .update(source)
            .update("\0");
        sourceBytes += Buffer.byteLength(source);
        sourceDigests[path.relative(root, file)] = createHash("sha256")
            .update(source)
            .digest("hex");
    }
    return {
        files,
        coverage: {
            inventory: inv,
            issues: [...issues].sort(),
            snapshot: digest.digest("hex"),
            sourceDigests,
            durationMs: performance.now() - started,
            sourceBytes,
        },
    };
}
function declarationsAt(program, name) {
    var _a;
    const identifier = (n) => {
        if (n.type === "Identifier")
            return n.name === name ? n.start : undefined;
        if (n.type === "Property")
            return identifier(n.value);
        if (n.type === "AssignmentPattern")
            return identifier(n.left);
        if (["ObjectPattern", "ArrayPattern", "RestElement"].includes(n.type)) {
            for (const child of children(n)) {
                const match = identifier(child);
                if (match !== undefined)
                    return match;
            }
        }
        return undefined;
    };
    for (const stmt of children(program)) {
        const n = (_a = stmt.declaration) !== null && _a !== void 0 ? _a : stmt;
        if (n.id) {
            const found = identifier(n.id);
            if (found !== undefined)
                return found;
        }
        if (n.type === "VariableDeclaration")
            for (const decl of n.declarations) {
                const found = identifier(decl.id);
                if (found !== undefined)
                    return found;
            }
    }
    return undefined;
}
function qualifierRoot(n) {
    return n.type === "TSQualifiedName"
        ? qualifierRoot(n.left)
        : nodeName(n);
}
