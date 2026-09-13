import { createHash } from "node:crypto";
import { analyzeSyntax, Node } from "./analysis.js";
import { SourceRange } from "./contract.js";

export interface FunctionStructure extends SourceRange {
  name: string;
  fingerprint: string;
  statements: number;
  nodes: number;
  captures: string[];
}
export function functionStructures(
  file: string,
  source: string,
): FunctionStructure[] {
  const { program, scopes } = analyzeSyntax(file, source);
  const out: FunctionStructure[] = [];
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
  const normalize = (value: unknown): unknown => {
    if (typeof value === "bigint") return { bigint: value.toString() };
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !ignored.has(k) || (k === "raw" && "cooked" in value))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalize(v)]),
    );
  };
  const at = (offset: number) => {
    const lines = source.slice(0, offset).split("\n");
    return { line: lines.length, column: lines[lines.length - 1].length };
  };
  const visit = (n: Node): void => {
    const id = n.id as Node | undefined;
    if (
      (n.type === "FunctionDeclaration" || n.type === "FunctionExpression") &&
      typeof id?.name === "string" &&
      n.body
    ) {
      const body = n.body as Node;
      let nodes = 0,
        statements = 0;
      const count = (x: Node): void => {
        nodes++;
        if (
          /Statement$|VariableDeclaration$/.test(x.type) &&
          x.type !== "BlockStatement"
        )
          statements++;
        children(x).forEach(count);
      };
      count(body);
      const start = n.start as number,
        end = n.end as number,
        a = at(start),
        b = at(end);
      const captures = new Set<string>();
      for (const scope of scopes.scopes)
        for (const ref of scope.references) {
          const pos = ref.identifier.range?.[0];
          if (pos === undefined || pos < start || pos >= end) continue;
          const decl = ref.resolved?.defs[0]?.name.range?.[0];
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
          .update(
            JSON.stringify(
              normalize({
                params: n.params,
                body,
                async: n.async,
                generator: n.generator,
              }),
            ),
          )
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
export function children(n: Node): Node[] {
  return Object.values(n)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter(
      (v): v is Node =>
        !!v && typeof v === "object" && typeof (v as Node).type === "string",
    );
}
