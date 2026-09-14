import { createHash } from "node:crypto";
import type {
  AnalysisCalls, CallTarget, ExpressionRef, IdentityOrigin, IdentityQuery,
  IdentityValue, SemanticEvidence, SemanticResult, SourceRange,
} from "./contract.js";
import { SEMANTIC_RESULT_VERSION } from "./contract.js";

type FlowValue = AnalysisCalls["structure"]["flow"]["values"][number];

const unknown = <T>(reason: "provider-failure" | "unsupported-expression" | "unresolved-identity", evidence?: SemanticEvidence[]): SemanticResult<T> => ({
  version: SEMANTIC_RESULT_VERSION,
  status: "unknown",
  reason,
  ...(evidence?.length ? { evidence } : {}),
});

/** Host-owned lexical identity. The doctor supplies accepted technology names;
 * parsing, alias resolution, shadowing and evidence stay behind this seam. */
export function identityResult(
  file: string,
  source: string,
  facts: AnalysisCalls,
  expression: ExpressionRef,
  query: IdentityQuery,
): SemanticResult<IdentityValue> {
  const digest = createHash("sha256").update(source).digest("hex");
  const flow = facts.structure.flow;
  const values = new Map(flow.values.map((value) => [value.id, value]));
  const bindings = new Map(flow.bindings.map((binding) => [binding.binding, binding]));
  const states = new Map(facts.structure.bindings.map((binding) => [binding.binding, binding]));
  // Expression coordinates are the stable transport identity. The numeric id
  // is a same-projection fast path, not a promise that provider traversal ids
  // remain identical across independently materialized models.
  const byId = values.get(expression.id);
  const start = byId?.start === expression.start && byId.end === expression.end
    ? byId
    : flow.values.find((value) => value.start === expression.start && value.end === expression.end);
  if (!start) return unknown("unsupported-expression");

  const evidence: SemanticEvidence[] = [];
  const addEvidence = (kind: SemanticEvidence["kind"], value: FlowValue, relationship?: string): void => {
    if (evidence.some((item) => item.kind === kind && item.range.start === value.start && item.range.end === value.end)) return;
    evidence.push({ kind, file, sourceDigest: digest, range: rangeOf(value), ...(relationship ? { relationship } : {}) });
  };
  const stable = (binding: number): boolean => !states.get(binding)?.reassigned && !states.get(binding)?.mutated;
  const resolve = (id: number, seen = new Set<number>()): FlowValue | null => {
    const value = values.get(id);
    if (!value || seen.has(id)) return null;
    addEvidence(seen.size ? "alias" : "expression", value, seen.size ? "immutable-alias" : undefined);
    seen = new Set(seen).add(id);
    if (value.kind === "reference" && value.target?.binding !== null && value.target?.binding !== undefined) {
      const binding = value.target.binding;
      if (!stable(binding)) return value;
      const initializer = bindings.get(binding)?.initializer;
      if (initializer !== undefined) {
        const resolved = resolve(initializer, seen);
        if (resolved?.target) return resolved;
        return value;
      }
    }
    return value;
  };

  const resolved = resolve(start.id);
  if (!resolved?.target) return unknown("unsupported-expression", evidence);
  const origin = originOf(resolved.target);
  if (!origin) return unknown("unresolved-identity", evidence);
  if (origin.kind === "global" && !(query.globals ?? []).includes(origin.name)) return unknown("unresolved-identity", evidence);
  if (origin.kind === "local") {
    const declaration = flow.values.find((value) => value.start === origin.binding && value.kind === "reference");
    if (declaration) evidence.push({ kind: "binding", file, sourceDigest: digest, range: rangeOf(declaration), relationship: "lexical-binding" });
  }
  return { version: SEMANTIC_RESULT_VERSION, status: "known", value: { matches: matches(origin, query), origin }, evidence };
}

function originOf(target: CallTarget): IdentityOrigin | null {
  if (target.source && target.importedName) return { kind: "import", source: target.source, name: target.importedName };
  if (target.binding !== null) return { kind: "local", binding: target.binding };
  if (!target.root) return null;
  const name = [target.root, ...target.members].join(".");
  return { kind: "global", name };
}

function matches(origin: IdentityOrigin, query: IdentityQuery): boolean {
  if (origin.kind === "global") return (query.globals ?? []).includes(origin.name);
  if (origin.kind === "import") return (query.imports ?? []).some((item) => item.source === origin.source && item.names.includes(origin.name));
  return false;
}

function rangeOf(value: FlowValue): SourceRange {
  return { start: value.start, end: value.end, line: value.line, column: value.column, endLine: value.endLine, endColumn: value.endColumn };
}
