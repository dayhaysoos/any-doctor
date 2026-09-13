import { createHash } from "node:crypto";
import { analyzeSyntax } from "./analysis.js";
export function functionStructures(file, source) {
    const { program, scopes } = analyzeSyntax(file, source);
    const out = [];
    const ignored = new Set([
        "start",
        "end",
        "range",
        "loc",
        "raw",
        "comments",
        "leadingComments",
        "trailingComments",
    ]);
    const normalize = (value) => {
        if (typeof value === "bigint")
            return { bigint: value.toString() };
        if (Array.isArray(value))
            return value.map(normalize);
        if (!value || typeof value !== "object")
            return value;
        return Object.fromEntries(Object.entries(value)
            .filter(([k]) => !ignored.has(k) || (k === "raw" && "cooked" in value))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, normalize(v)]));
    };
    const at = (offset) => {
        const lines = source.slice(0, offset).split("\n");
        return { line: lines.length, column: lines[lines.length - 1].length };
    };
    const visit = (n) => {
        var _a, _b, _c, _d;
        const id = n.id;
        if ((n.type === "FunctionDeclaration" || n.type === "FunctionExpression") &&
            typeof (id === null || id === void 0 ? void 0 : id.name) === "string" &&
            n.body) {
            const body = n.body;
            let nodes = 0, statements = 0;
            const count = (x) => {
                nodes++;
                if (/Statement$|VariableDeclaration$/.test(x.type) &&
                    x.type !== "BlockStatement")
                    statements++;
                children(x).forEach(count);
            };
            count(body);
            const start = n.start, end = n.end, a = at(start), b = at(end);
            const captures = new Set();
            for (const scope of scopes.scopes)
                for (const ref of scope.references) {
                    const pos = (_a = ref.identifier.range) === null || _a === void 0 ? void 0 : _a[0];
                    if (pos === undefined || pos < start || pos >= end)
                        continue;
                    const decl = (_d = (_c = (_b = ref.resolved) === null || _b === void 0 ? void 0 : _b.defs[0]) === null || _c === void 0 ? void 0 : _c.name.range) === null || _d === void 0 ? void 0 : _d[0];
                    if (decl === undefined || decl < start || decl >= end)
                        captures.add(ref.identifier.name);
                }
            out.push({
                name: id.name,
                start,
                end,
                line: a.line,
                column: a.column,
                endLine: b.line,
                endColumn: b.column,
                fingerprint: createHash("sha256")
                    .update(JSON.stringify(normalize({
                    params: n.params,
                    body,
                    async: n.async,
                    generator: n.generator,
                })))
                    .digest("hex"),
                statements,
                nodes,
                captures: [...captures].sort(),
            });
        }
        children(n).forEach(visit);
    };
    visit(program);
    return out;
}
export function children(n) {
    return Object.values(n)
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .filter((v) => !!v && typeof v === "object" && typeof v.type === "string");
}
