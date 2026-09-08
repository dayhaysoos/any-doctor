import { createRequire } from "module";

// The analysis adapter: the one place that knows how to run the identity
// stack — oxc-parser (fast TS parse, a native optional dependency) plus
// eslint-scope (scope and reference resolution over the ESTree-shaped
// AST). CONTEXT.md names this seam: ast-grep answers shapes through the
// search engine; this answers identities — which declaration a name
// resolves to, and every place that binding is referenced.
//
// The stack loads lazily and synchronously: oxc-parser is an
// optionalDependency, so absence is a first-class state, not a crash —
// the host reports it, checks narrow, and the report says so. If oxc
// ever ships JS semantic bindings of its own (their issue #22985), this
// module's implementation swaps; nothing above it moves.

export interface AnalysisStatus {
  available: true;
}

export type AnalysisStatusResult = AnalysisStatus | { available: false; reason: string };

type ParseSync = typeof import("oxc-parser").parseSync;
type Analyze = typeof import("eslint-scope").analyze;
type VisitorKeys = typeof import("eslint-visitor-keys");

type LoadedStack =
  | { parseSync: ParseSync; analyze: Analyze; keys: VisitorKeys; error?: undefined }
  | { error: string };

let loaded: LoadedStack | null = null;

const require_ = createRequire(import.meta.url);

function loadStack(): LoadedStack {
  if (loaded !== null) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseSync } = require_("oxc-parser") as { parseSync: ParseSync };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { analyze } = require_("eslint-scope") as { analyze: Analyze };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const keys = require_("eslint-visitor-keys") as VisitorKeys;
    loaded = { parseSync, analyze, keys };
  } catch (e) {
    loaded = { error: `the analysis engine is not installed (${e instanceof Error ? e.message : String(e)}) — npm install oxc-parser` };
  }
  return loaded;
}

export function analysisStatus(): AnalysisStatusResult {
  const stack = loadStack();
  return stack.error !== undefined ? { available: false, reason: stack.error } : { available: true };
}

// The wire shapes doctors see (contract.ts re-exports the types). Lines
// are 1-based, columns 0-based — ctx.search's convention, so reference
// positions compose with Match positions without conversion.
export interface BindingRef {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  write: boolean;
}

export interface BindingInfo {
  name: string;
  kind: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  references: BindingRef[];
}

export interface AnalysisFile {
  file: string;
  bindings: BindingInfo[];
}

export type AnalysisResult = { ok: true; file: AnalysisFile } | { ok: false; error: string };

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
  let scopeManager: import("eslint-scope").ScopeManager;
  try {
    scopeManager = stack.analyze(program as never, {
      sourceType: "module",
      ecmaVersion: 2026,
      childVisitorKeys: stack.keys.KEYS as never,
    });
  } catch (e) {
    return { ok: false, error: `analysis failed to resolve scopes in ${file}: ${e instanceof Error ? e.message : String(e)}` };
  }

  const pos = positioner(source);
  const bindings: BindingInfo[] = [];
  const global = scopeManager.globalScope;
  if (global === null) return { ok: false, error: `analysis failed to resolve scopes in ${file}` };
  for (const scope of allScopes(global)) {
    for (const variable of scope.variables) {
      const def = variable.defs[0];
      if (def === undefined) continue; // builtins and implicit globals carry no def
      // The declaration's own extent: for variables the declarator (so a
      // binding's span contains its initializer), for parameters the
      // identifier itself (eslint-scope hands the whole function node for
      // params, which would swallow the body).
      const node = def.node as { range?: [number, number] } | null;
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
      });
    }
  }
  return { ok: true, file: { file, bindings } };
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

function allScopes(scope: import("eslint-scope").Scope, out: import("eslint-scope").Scope[] = []): import("eslint-scope").Scope[] {
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
