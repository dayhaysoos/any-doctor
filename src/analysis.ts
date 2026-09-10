import { createRequire } from "module";
import { AnalysisFile, AnalysisSpans, BindingInfo, BindingRef, SpanInfo } from "./contract.js";

// The analysis adapter: the one place that knows how to run the identity
// stack — oxc-parser (fast TS parse, a native optional dependency) plus
// @typescript-eslint/scope-manager (scope and reference resolution that
// understands JSX references and TypeScript type positions — the two
// classes eslint-scope cannot see, whose absence produced the 0.0.4
// false-positive flood). CONTEXT.md names this seam: ast-grep answers
// shapes through the search engine; this answers identities — which
// declaration a name resolves to, every place that binding is
// referenced, and the language facts (exportedness, exclusion patterns)
// doctors must not re-derive with regexes.
//
// The stack loads lazily and synchronously: oxc-parser is an
// optionalDependency, so absence is a first-class state, not a crash —
// the host reports it, checks narrow, and the report says so. If oxc
// ever ships JS semantic bindings of its own (their issue #22985), this
// module's implementation swaps; nothing above it moves.

export type { AnalysisFile, AnalysisSpans, BindingInfo, BindingRef, SpanInfo };

export interface AnalysisStatus {
  available: true;
}

export type AnalysisStatusResult = AnalysisStatus | { available: false; reason: string };

type ParseSync = typeof import("oxc-parser").parseSync;
type Analyze = typeof import("@typescript-eslint/scope-manager").analyze;

type LoadedStack =
  | { parseSync: ParseSync; analyze: Analyze; error?: undefined }
  | { error: string };

let loaded: LoadedStack | null = null;

const require_ = createRequire(import.meta.url);

function loadStack(): LoadedStack {
  if (loaded !== null) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseSync } = require_("oxc-parser") as { parseSync: ParseSync };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { analyze } = require_("@typescript-eslint/scope-manager") as { analyze: Analyze };
    loaded = { parseSync, analyze };
  } catch (e) {
    loaded = { error: `the analysis engine is not installed (${e instanceof Error ? e.message : String(e)}) — npm install oxc-parser` };
  }
  return loaded;
}

export function analysisStatus(): AnalysisStatusResult {
  const stack = loadStack();
  return stack.error !== undefined ? { available: false, reason: stack.error } : { available: true };
}

export type AnalysisResult = { ok: true; file: AnalysisFile } | { ok: false; error: string };

export type SpansResult = { ok: true; file: AnalysisSpans } | { ok: false; error: string };

// One file in, every function-like span out (D26): an AST fact answering
// what the doctors' private brace-counting copies could only approximate.
// Semicolons inside multi-line callbacks, strings containing braces, JSX —
// none of it can truncate a span that the parser already knows. Named
// declarations carry their id; arrows and anonymous expressions carry null.
export function analyzeSpans(file: string, source: string): SpansResult {
  const stack = loadStack();
  if (stack.error !== undefined) return { ok: false, error: stack.error };

  let program: unknown;
  try {
    program = stack.parseSync(file, source, { sourceType: "module" }).program;
  } catch (e) {
    return { ok: false, error: `analysis failed to parse ${file}: ${e instanceof Error ? e.message : String(e)}` };
  }

  const pos = positioner(source);
  const spans: SpanInfo[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as Node;
    let span: SpanInfo | null = null;
    if (n.type === "FunctionDeclaration" || n.type === "TSDeclareFunction") {
      span = spanOf(n, "function", idName(n.id));
    } else if (n.type === "FunctionExpression") {
      span = spanOf(n, "function-expression", idName(n.id));
    } else if (n.type === "ArrowFunctionExpression") {
      span = spanOf(n, "arrow", null);
    } else if (n.type === "ClassDeclaration" || n.type === "ClassExpression") {
      span = spanOf(n, "class", idName(n.id));
    } else if (n.type === "MethodDefinition" || n.type === "TSAbstractMethodDefinition") {
      span = spanOf(n.value as Node, "method", propertyName(n.key));
    }
    if (span !== null) spans.push(span);
    for (const key of Object.keys(n)) {
      if (key === "range" || key === "start" || key === "end") continue;
      const v = n[key];
      if (Array.isArray(v)) {
        for (const child of v) if (isNode(child)) visit(child);
      } else if (isNode(v)) visit(v);
    }
  };
  visit(program);
  return { ok: true, file: { file, spans } };

  function spanOf(n: Node, kind: SpanInfo["kind"], name: string | null): SpanInfo | null {
    if (typeof n.start !== "number" || typeof n.end !== "number") return null;
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

function idName(id: unknown): string | null {
  return id && typeof (id as { name?: unknown }).name === "string" ? (id as { name: string }).name : null;
}

function propertyName(key: unknown): string | null {
  const k = key as { name?: unknown; value?: unknown } | undefined;
  if (k && typeof k.name === "string") return k.name;
  if (k && typeof k.value === "string") return k.value; // computed / literal keys
  return null;
}

function isNode(v: unknown): v is Node {
  return Boolean(v) && typeof v === "object" && typeof (v as { type?: unknown }).type === "string";
}

// One file in, one identity model out: every binding (declarations,
// parameters, imports) with the span of its declaring node and every
// reference to it, read or write. Type-position identifiers never become
// references (eslint-scope only resolves value positions); TS-only
// declarations (enums, namespaces) are not modeled — declared blind-spot
// territory for checks that care.
export function analyzeBindings(file: string, source: string): AnalysisResult {
  const stack = loadStack();
  if (stack.error !== undefined) return { ok: false, error: stack.error };

  let program: unknown;
  try {
    program = stack.parseSync(file, source, { sourceType: "module" }).program;
  } catch (e) {
    return { ok: false, error: `analysis failed to parse ${file}: ${e instanceof Error ? e.message : String(e)}` };
  }

  addRanges(program as Record<string, unknown>);
  let scopeManager: import("@typescript-eslint/scope-manager").ScopeManager;
  try {
    scopeManager = stack.analyze(program as never, {
      sourceType: "module",
    });
  } catch (e) {
    return { ok: false, error: `analysis failed to resolve scopes in ${file}: ${e instanceof Error ? e.message : String(e)}` };
  }

  const pos = positioner(source);
  const bindings: BindingInfo[] = [];
  const global = scopeManager.globalScope;
  if (global === null) return { ok: false, error: `analysis failed to resolve scopes in ${file}` };
  // Language facts computed from the AST once, so doctors never re-derive
  // them with regexes: what is exported, and what is an intentional
  // object-rest exclusion.
  const facts = languageFacts(program as never);
  for (const scope of allScopes(global)) {
    for (const variable of scope.variables) {
      const def = variable.defs[0];
      if (def === undefined) continue; // builtins and implicit globals carry no def
      // The declaration's own extent: for variables the declarator (so a
      // binding's span contains its initializer), for parameters the
      // identifier itself (scope managers hand the whole function node for
      // params, which would swallow the body).
      const node = def.node;
      const span = def.type === "Parameter" ? def.name.range : (node?.range ?? def.name.range);
      if (span === undefined) continue;
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
            line: pos.line(r.identifier.range![0]),
            column: pos.column(r.identifier.range![0]),
            endLine: pos.line(r.identifier.range![1]),
            endColumn: pos.column(r.identifier.range![1]),
            write: r.isWrite(),
          })),
        exported: facts.exported.has(variable.name) || undefined,
        excluded: facts.excluded.has(variable.name) || undefined,
      });
    }
  }
  return { ok: true, file: { file, bindings } };
}

// Walk the program for the two facts the scope manager does not surface:
// named-export membership (every declarator under an export statement,
// every specifier's local name, export-default function names) and the
// object-rest exclusion idiom (identifiers bound beside a ...rest —
// their unreadness is the point, not a defect).
type Node = { type: string; range?: [number, number]; [k: string]: unknown };

function languageFacts(program: Node): { exported: Set<string>; excluded: Set<string> } {
  const exported = new Set<string>();
  const excluded = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as Node;
    if (n.type === "ExportNamedDeclaration" && n.declaration) {
      collectDeclaredNames(n.declaration as Node, exported);
    }
    if (n.type === "ExportNamedDeclaration" && Array.isArray(n.specifiers)) {
      for (const spec of n.specifiers as Node[]) {
        if (spec.local && typeof (spec.local as Node).name === "string") {
          exported.add((spec.local as { name: string }).name);
        }
      }
    }
    if (n.type === "ExportDefaultDeclaration") {
      const d = n.declaration as Node | undefined;
      if (d && typeof d.id === "object" && d.id && typeof (d.id as { name?: unknown }).name === "string") {
        exported.add((d.id as { name: string }).name);
      }
    }
    if (n.type === "ObjectPattern" && Array.isArray(n.properties)) {
      const hasRest = (n.properties as Node[]).some((p) => p.type === "RestElement");
      if (hasRest) {
        for (const p of n.properties as Node[]) {
          if (p.type === "Property" && p.value && (p.value as Node).type === "Identifier") {
            excluded.add((p.value as { name: string }).name);
          }
        }
      }
    }
    for (const key of Object.keys(n)) {
      if (key === "range" || key === "start" || key === "end" || key === "tokens" || key === "comments") continue;
      const v = n[key];
      if (Array.isArray(v)) {
        for (const child of v) {
          if (child && typeof child === "object" && typeof (child as { type?: unknown }).type === "string") visit(child);
        }
      } else if (v && typeof v === "object" && typeof (v as { type?: unknown }).type === "string") {
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
function collectDeclaredNames(decl: Node, into: Set<string>): void {
  if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration" || decl.type === "TSDeclareFunction") {
    if (decl.id && typeof (decl.id as { name?: unknown }).name === "string") {
      into.add((decl.id as { name: string }).name);
    }
    return;
  }
  if (decl.type === "VariableDeclaration" && Array.isArray(decl.declarations)) {
    for (const d of decl.declarations as Node[]) {
      collectPatternNames(d.id as Node, into);
    }
  }
}

function collectPatternNames(pattern: Node, into: Set<string>): void {
  if (pattern.type === "Identifier") {
    into.add(pattern.name as string);
    return;
  }
  if ((pattern.type === "ObjectPattern" || pattern.type === "ArrayPattern") && Array.isArray(pattern.properties ?? pattern.elements)) {
    const items = (pattern.properties ?? pattern.elements) as Node[];
    for (const item of items) {
      if (!item) continue;
      if (item.type === "Property") collectPatternNames(item.value as Node, into);
      else if (item.type === "RestElement") collectPatternNames(item.argument as Node, into);
      else collectPatternNames(item, into);
    }
  }
  if (pattern.type === "AssignmentPattern") collectPatternNames(pattern.left as Node, into);
}

// eslint-scope expects `range: [start, end]` on nodes; oxc emits start/end.
function addRanges(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const n = node as { start?: number; end?: number; range?: [number, number]; [k: string]: unknown };
  if (typeof n.start === "number" && typeof n.end === "number") n.range = [n.start, n.end];
  for (const key of Object.keys(n)) {
    if (key === "range" || key === "start" || key === "end") continue;
    const v = n[key];
    if (Array.isArray(v)) {
      for (const child of v) addRanges(child);
    } else if (v && typeof v === "object" && typeof (v as { type?: unknown }).type === "string") {
      addRanges(v);
    }
  }
}

type AnyRef = { identifier: { range?: [number, number] }; isWrite(): boolean };
type AnyVariable = { name: string; defs: { type: string; node: { range?: [number, number] } | null; name: { range?: [number, number] } }[]; references: AnyRef[] };
type AnyScope = { childScopes: AnyScope[]; variables: AnyVariable[] };
function allScopes(scope: AnyScope, out: AnyScope[] = []): AnyScope[] {
  out.push(scope);
  for (const child of scope.childScopes) allScopes(child, out);
  return out;
}

// Byte offset → ctx position conventions, one index per file.
function positioner(source: string): { line: (offset: number) => number; column: (offset: number) => number } {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return {
    line: (offset) => lowerBound(starts, offset) + 1,
    column: (offset) => offset - starts[lowerBound(starts, offset)],
  };
}

function lowerBound(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sorted[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
