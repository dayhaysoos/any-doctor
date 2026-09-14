import { createHash } from "node:crypto";
import { projectConsumers, ProjectConsumers } from "./project-consumers.js";
import { functionStructures, FunctionStructure } from "./function-structure.js";
import * as fs from "fs";
import * as path from "path";
import { AnalysisFile, AnalysisSpans, AnalysisCalls, ExpressionRef, IdentityQuery, IdentityValue, Mode, searchBase, SemanticResult, SEMANTIC_RESULT_VERSION, ValueDisposition, ValueDispositionQuery, withinBase, withinDir } from "./contract.js";
import { analysisStatus, analyzeBindings, analyzeSpans, analyzeCalls, AnalysisResult, AnalysisStatusResult, SpansResult } from "./analysis.js";
import { identityResult, valueDispositionResult } from "./doctor-sdk.js";

// The analysis host: the identity engine's side of the channel, a sibling
// to the search host. The search host routes `op: "analysis"` requests
// here; this module owns the per-file identity models — parse once,
// answer many — cached by content digest so verify's re-seeded sandboxes
// invalidate correctly while a run's repeated questions stay cheap.
//
// The root check is the same security decision as search's: a run may
// analyze its target, a verify its fixture sandboxes, meta nothing.

type Analyzer = typeof analyzeBindings;
type SpansAnalyzer = typeof analyzeSpans;
type Status = typeof analysisStatus;

// One cache per host process. The host lives in the runner process, so
// the lifetime is the any-doctor invocation; across a cohort's doctors
// the same unchanged file answers from memory.
const modelCache = new Map<string, { digest: string; file: AnalysisFile }>();
const callsCache = new Map<string, { digest: string; file: AnalysisCalls }>();
const spansCache = new Map<string, { digest: string; file: AnalysisSpans }>();

// Test seam: the model cache is keyed by content digest for the process
// lifetime; tests bust it between cases. Invisible to slop's
// default run. Consumer graphs include test evidence independently.
export function clearAnalysisCache(): void {
  modelCache.clear();
  spansCache.clear();
  callsCache.clear();
}

export interface AnalysisRequestBody {
  kind?: unknown;
  file?: unknown;
  root?: unknown;
  sourceDigest?: unknown;
  expression?: unknown;
  query?: unknown;
}

export type AnalysisResponse =
  | { project: ProjectConsumers }
  | { structures: FunctionStructure[] }
  | { available: boolean; reason?: string }
  | { file: AnalysisFile }
  | { file: AnalysisSpans }
  | { file: AnalysisCalls }
  | { semantic: SemanticResult<IdentityValue | ValueDisposition> }
  | { error: string };

export function handleAnalysisRequest(
  req: AnalysisRequestBody,
  mode: Mode,
  analyzer: Analyzer = analyzeBindings,
  status: Status = analysisStatus,
  spansAnalyzer: SpansAnalyzer = analyzeSpans,
  callsAnalyzer: typeof analyzeCalls = analyzeCalls,
): AnalysisResponse {
  const base = searchBase(mode);
  const root = typeof req.root === "string" ? path.resolve(req.root) : "";
  if (base === "" || !withinBase(root, base)) {
    return { error: "ctx.analysis failed: analysis root is outside the allowed target" };
  }
  if (req.kind === "available") {
    const s: AnalysisStatusResult = status();
    return s.available ? { available: true } : { available: false, reason: s.reason };
  }
  if ((req.kind === "identity" || req.kind === "value-disposition") && !status().available) {
    return { semantic: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "analysis-unavailable" } };
  }
  if (typeof req.file === "string" && req.sourceDigest !== undefined) {
    try {
      const abs = path.resolve(root, req.file);
      if (!withinDir(abs, root) || !withinDir(fs.realpathSync(abs), fs.realpathSync(root))) return { error: "analysis file outside root" };
      const digest = createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
      if (digest !== req.sourceDigest) return { error: `source changed during analysis: ${req.file}` };
    } catch (e) { return { error: String(e) }; }
  }
  if (req.kind === "project" || req.kind === "structures") {
    try {
      if (!status().available) return { error: "consumer/structure analysis unavailable" };
      if (req.kind === "project") return { project: projectConsumers(root) };
      if (typeof req.file !== "string" || !req.file) return { error: "structures needs a file" };
      const abs = path.resolve(root, req.file);
      if (!withinDir(abs, root) || !withinDir(fs.realpathSync(abs), fs.realpathSync(root))) return { error: "structure file is outside root" };
      return { structures: functionStructures(req.file, fs.readFileSync(abs, "utf8")) };
    } catch (e) { return { error: String(e) }; }
  }
  if (req.kind === "bindings" || req.kind === "spans" || req.kind === "calls" || req.kind === "identity" || req.kind === "value-disposition") {
    if (typeof req.file !== "string" || req.file === "") {
      return { error: `ctx.analysis.${req.kind} needs a "file" path` };
    }
    const abs = path.resolve(root, req.file);
    if (!withinDir(abs, root)) {
      return { error: `ctx.analysis failed: file is outside the search root: ${req.file}` };
    }
    if (req.kind === "identity" || req.kind === "value-disposition") {
      const expression = parseExpression(req.expression);
      const query = req.kind === "identity" ? parseIdentityQuery(req.query) : parseDispositionQuery(req.query);
      if (!expression || !query) return { semantic: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "unsupported-expression" } };
      const model = cachedModel(abs, root, callsCache, callsAnalyzer, req.file);
      if ("error" in model) return { semantic: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "provider-failure" } };
      try {
        const source=fs.readFileSync(abs,"utf8");
        return { semantic: req.kind === "identity" ? identityResult(req.file,source,model.file,expression,query as IdentityQuery) : valueDispositionResult(req.file,source,model.file,expression,query as ValueDispositionQuery) };
      } catch {
        return { semantic: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "provider-failure" } };
      }
    }
    if (req.kind === "bindings") {
      return cachedModel(abs, root, modelCache, analyzer, req.file);
    }
    if (req.kind === "calls") return cachedModel(abs, root, callsCache, callsAnalyzer, req.file);
    return cachedModel(abs, root, spansCache, spansAnalyzer, req.file);
  }
  return { error: `unknown analysis kind ${JSON.stringify(req.kind)} — known kinds: available, bindings, spans, calls, identity, value-disposition` };
}

function parseDispositionQuery(value: unknown): ValueDispositionQuery | null {
  if (!value || typeof value !== "object") return null;
  const consumers=(value as Record<string,unknown>).consumers;
  return Array.isArray(consumers)&&consumers.every(item=>typeof item==="string") ? {consumers} : null;
}

function parseExpression(value: unknown): ExpressionRef | null {
  if (!value || typeof value !== "object") return null;
  const ref = value as Record<string, unknown>;
  return [ref.id, ref.start, ref.end].every(Number.isInteger) ? ref as unknown as ExpressionRef : null;
}

function parseIdentityQuery(value: unknown): IdentityQuery | null {
  if (!value || typeof value !== "object") return null;
  const query = value as Record<string, unknown>;
  if (query.globals !== undefined && (!Array.isArray(query.globals) || !query.globals.every((item) => typeof item === "string"))) return null;
  if (query.imports !== undefined && (!Array.isArray(query.imports) || !query.imports.every((item) => item && typeof item === "object" && typeof item.source === "string" && Array.isArray(item.names) && item.names.every((name: unknown) => typeof name === "string")))) return null;
  return query as unknown as IdentityQuery;
}

// The shared per-file model lifecycle: read (cache hit on content digest),
// read, compute, cache. Bindings and spans are the same policy over two
// analyzers and two caches.
function cachedModel<T>(
  abs: string,
  root: string,
  cache: Map<string, { digest: string; file: T }>,
  compute: (rel: string, source: string) => { ok: true; file: T } | { ok: false; error: string },
  relFile: string,
): { file: T } | { error: string } {
  let source: string;
  let digest: string;
  try {
    if (!withinDir(fs.realpathSync(abs), fs.realpathSync(root))) return { error: "analysis file outside root" };
    source = fs.readFileSync(abs, "utf8");
    digest = createHash("sha256").update(source).digest("hex");
    const cached = cache.get(abs);
    if (cached && cached.digest === digest) return { file: cached.file };
  } catch {
    return { error: `ctx.analysis failed: cannot read ${relFile}` };
  }
  const rel = path.relative(root, abs);
  const r = compute(rel, source);
  if (!r.ok) return { error: r.error };
  cache.set(abs, { digest, file: r.file });
  return { file: r.file };
}
