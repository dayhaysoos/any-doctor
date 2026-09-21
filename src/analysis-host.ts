import { createHash } from "node:crypto";
import { projectConsumers, ProjectConsumers } from "./project-consumers.js";
import { functionStructures, FunctionStructure } from "./function-structure.js";
import * as fs from "fs";
import * as path from "path";
import { AnalysisFile, AnalysisSpans, AnalysisCalls, ExpressionRef, ForbiddenCallRecipeQuery, IdentityQuery, IdentityValue, Mode, OptionPresence, OptionPresenceQuery, RecipeDecision, RequiredOptionRecipeQuery, ResourceLifetime, ResourceLifetimeQuery, ResourceWithoutReleaseRecipeQuery, searchBase, SemanticResult, SEMANTIC_RESULT_VERSION, UnhandledValueRecipeQuery, ValueDisposition, ValueDispositionQuery, withinBase, withinDir } from "./contract.js";
import { analysisStatus, analyzeBindings, analyzeSpans, analyzeCalls, AnalysisResult, AnalysisStatusResult, semanticProviderProvenance, SpansResult } from "./analysis.js";
import { forbiddenCallRecipeResult, identityResult, optionPresenceResult, requiredOptionRecipeResult, resourceLifetimeResult, resourceWithoutReleaseRecipeResult, unhandledValueRecipeResult, valueDispositionResult } from "./doctor-sdk.js";

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
  | { available: boolean; reason?: string; provider?: import("./contract.js").SemanticProviderProvenance }
  | { file: AnalysisFile }
  | { file: AnalysisSpans }
  | { file: AnalysisCalls }
  | { semantic: SemanticResult<IdentityValue | ValueDisposition | ResourceLifetime | OptionPresence | RecipeDecision> }
  | { error: string };

// Pair parsing with evaluation so each semantic kind has one typed owner.
function semanticHandler<Q, R>(
  parse: (value: unknown) => Q | null,
  evaluate: (file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef, query: Q) => SemanticResult<R>,
) {
  return (value: unknown) => {
    const query = parse(value);
    return query === null ? null : (file: string, source: string, facts: AnalysisCalls, expression: ExpressionRef) =>
      evaluate(file, source, facts, expression, query);
  };
}

const semanticHandlers = {
  identity: semanticHandler(parseIdentityQuery, identityResult),
  "value-disposition": semanticHandler(parseDispositionQuery, valueDispositionResult),
  "resource-lifetime": semanticHandler(parseResourceQuery, resourceLifetimeResult),
  "option-presence": semanticHandler(parseOptionQuery, optionPresenceResult),
  "recipe-unhandled-value": semanticHandler(parseUnhandledRecipe, unhandledValueRecipeResult),
  "recipe-resource-without-release": semanticHandler(parseResourceRecipe, resourceWithoutReleaseRecipeResult),
  "recipe-required-option": semanticHandler(parseRequiredOptionRecipe, requiredOptionRecipeResult),
  "recipe-forbidden-call": semanticHandler(parseForbiddenCallRecipe, forbiddenCallRecipeResult),
};

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
    const provider = status === analysisStatus ? semanticProviderProvenance() : undefined;
    return s.available
      ? { available: true, ...(provider ? { provider } : {}) }
      : { available: false, reason: s.reason, ...(provider ? { provider } : {}) };
  }
  const semantic = typeof req.kind === "string" && Object.hasOwn(semanticHandlers, req.kind)
    ? semanticHandlers[req.kind as keyof typeof semanticHandlers] : undefined;
  if (semantic && !status().available) {
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
  if (req.kind === "bindings" || req.kind === "spans" || req.kind === "calls" || semantic) {
    if (typeof req.file !== "string" || req.file === "") {
      return { error: `ctx.analysis.${req.kind} needs a "file" path` };
    }
    const abs = path.resolve(root, req.file);
    if (!withinDir(abs, root)) {
      return { error: `ctx.analysis failed: file is outside the search root: ${req.file}` };
    }
    if (semantic) {
      const expression = parseExpression(req.expression);
      const evaluate = semantic(req.query);
      if (!expression || !evaluate) return { semantic: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "unsupported-expression" } };
      const model = cachedModel(abs, root, callsCache, callsAnalyzer, req.file);
      if ("error" in model) return { semantic: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "provider-failure" } };
      try {
        const source=fs.readFileSync(abs,"utf8");
        return { semantic: evaluate(req.file, source, model.file, expression) };
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
  return { error: `unknown analysis kind ${JSON.stringify(req.kind)} — known kinds: ${["available", "bindings", "spans", "calls", "project", "structures", ...Object.keys(semanticHandlers)].join(", ")}` };
}

function parseDispositionQuery(value: unknown): ValueDispositionQuery | null {
  if (!value || typeof value !== "object") return null;
  const consumers=(value as Record<string,unknown>).consumers;
  return Array.isArray(consumers)&&consumers.every(item=>typeof item==="string") ? {consumers} : null;
}
function parseResourceQuery(value:unknown):ResourceLifetimeQuery|null{if(!value||typeof value!=='object')return null;const record=value as Record<string,unknown>,owner=parseExpression(record.owner),release=record.release;return owner&&Array.isArray(release)&&release.every(item=>typeof item==='string')?{owner,release}:null;}
function parseOptionQuery(value:unknown):OptionPresenceQuery|null{if(!value||typeof value!=="object")return null;const record=value as Record<string,unknown>;return typeof record.option==="string"&&Array.isArray(record.sources)&&record.sources.every(item=>typeof item==="string")?{option:record.option,sources:record.sources}:null;}
function parseUnhandledRecipe(value:unknown):UnhandledValueRecipeQuery|null{if(!value||typeof value!=="object")return null;const record=value as Record<string,unknown>,producer=record.producer as Record<string,unknown>|undefined,consumers=record.consumers;return producer&&typeof producer.member==='string'&&Number.isInteger(producer.asyncArgument)&&producer.receiver==='array'&&Array.isArray(consumers)&&consumers.every(item=>typeof item==='string')?value as UnhandledValueRecipeQuery:null;}
function parseResourceRecipe(value:unknown):ResourceWithoutReleaseRecipeQuery|null{if(!value||typeof value!=="object")return null;const record=value as Record<string,unknown>,acquisition=parseIdentityQuery(record.acquisition),owner=record.owner as Record<string,unknown>|undefined,ownerIdentity=parseIdentityQuery(owner?.identity),release=record.release;return acquisition&&ownerIdentity&&Number.isInteger(owner?.argument)&&Array.isArray(release)&&release.every(item=>typeof item==='string')?value as ResourceWithoutReleaseRecipeQuery:null;}
function parseRequiredOptionRecipe(value:unknown):RequiredOptionRecipeQuery|null{if(!value||typeof value!=="object")return null;const record=value as Record<string,unknown>,call=parseIdentityQuery(record.call),option=parseOptionQuery(record.option);return call&&option?value as RequiredOptionRecipeQuery:null;}
function parseForbiddenCallRecipe(value:unknown):ForbiddenCallRecipeQuery|null{if(!value||typeof value!=="object")return null;const record=value as Record<string,unknown>,target=parseIdentityQuery(record.target),scope=record.scope as Record<string,unknown>|undefined;const strings=(item:unknown)=>item===undefined||Array.isArray(item)&&item.every(value=>typeof value==='string');return target&&(!scope||strings(scope.under)&&strings(scope.extensions)&&strings(scope.exclude))?value as ForbiddenCallRecipeQuery:null;}

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
