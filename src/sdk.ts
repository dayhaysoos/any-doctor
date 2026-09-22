import { createHash } from "node:crypto";
import { inventory } from "./file-scope.js";
import type { FileInventory } from "./file-scope.js";
import type { ProjectConsumers } from "./project-consumers.js";
import type { FunctionStructure } from "./function-structure.js";
import * as fs from "fs";
import * as path from "path";
import { ANALYSIS_CAPABILITY_NAMES, checkAnalysisNeeds, AnalysisFile, AnalysisSpans, AnalysisCalls, Capture, DEFAULT_EXTS, DoctorCtx, DoctorMeta, ExpressionRef, Finding, IdentityQuery, IdentityValue, Match, NamedRuleQuery, OptionPresence, OptionPresenceQuery, RecipeDecision, RecipeFinding, RecipeName, ResourceLifetime, ResourceLifetimeQuery, RuleQuery, SEARCH_REQUEST, SEARCH_RESULT, SemanticNarrowing, SemanticProviderProvenance, SemanticResult, SemanticRunReport, SEMANTIC_RESULT_VERSION, SourceRange, ValueDisposition, ValueDispositionQuery, ValuePathQuery, ValuePathValue, withinDir } from "./contract.js";
import { maskNonCode } from "./mask.js";
import { EngineQuery, RawSgCapture, RawSgMatch } from "./engine.js";
import { UNKNOWN_REASONS, type CustomNarrowing } from "./contract.js";
import { RECIPE_DEFINITIONS, type RecipeHostKind, type RegisteredRecipeQuery } from "./recipe-definitions.js";

// The verify harness forces the degraded path per fixture (fixture
// `analysis: "off"`): the loader flips this switch before running that
// fixture's sandbox, and every ctx in the child answers accordingly.
// Nothing else can disable analysis — a run never narrows silently.
let analysisForcedOff = false;

export function setAnalysisDisabled(disabled: boolean): void {
  analysisForcedOff = disabled;
}

// The loader's skip probe: would a ctx built now see the analysis engine?
// One channel question, cached by the verify loop. A channel-less direct
// loader invocation answers false — no host means no analysis, which is
// the honest answer for a narrowing decision (bindings() still fails
// loudly on a missing channel, exactly like ctx.search).
export function probeAnalysisAvailable(root: string): boolean {
  if (analysisForcedOff) return false;
  try {
    return Boolean(runAnalysis({ kind: "available" }, root).available);
  } catch {
    return false;
  }
}

// Production posture (D18): ctx.files.list() excludes test paths — tests
// mimic production shapes without being production reads. The law itself
// (isTestPath) and the run/verify derivation live in contract.ts; a run
// opts back in with --include-tests. ctx.files.read() is never filtered:
// an explicit path is a doctor's deliberate choice.
export function buildCtx(root: string, opts: { includeTests?: boolean } = {}): { ctx: DoctorCtx; getFindings(): Finding[]; getAnalysisCoverage(): ProjectConsumers["coverage"] | undefined; getSemanticReport(meta: DoctorMeta): SemanticRunReport | undefined } {
  const findings: Finding[] = [];
  const sourceCache = new Map<string,string>();
  const analysisFiles = new Map<string,AnalysisFile|AnalysisSpans|AnalysisCalls>();
  const narrowings = new Map<string,SemanticNarrowing>();
  const customChecks = new Map<string, Set<string>>();
  const execution={semanticQueries:0,modelRequests:0,modelCacheHits:0};
  const digest = (source: string) => createHash("sha256").update(source).digest("hex");
  function readSource(file: string): string {
    let source=sourceCache.get(file);
    if(source===undefined) {
      const abs=path.resolve(root,file);
      source=readFileWithin(root,file);
      sourceCache.set(file,source);
    }
    return source;
  }
  let availabilityCache: boolean | undefined;
  let providerCache: SemanticProviderProvenance | undefined;

  let project: ProjectConsumers | undefined;
  let fileInventory: FileInventory | undefined;
  // The one per-kind fetch with the one guard: availability check (the
  // loud failure names the kind and the needs declaration), channel call,
  // structural unwrap. bindings/spans/calls differ only in kind.
  const analysisFile = <T extends "bindings" | "spans" | "calls">(
    kind: T,
    file: string,
  ): T extends "bindings" ? AnalysisFile : T extends "spans" ? AnalysisSpans : AnalysisCalls => {
    if (analysisForcedOff || !ctx.analysis.available) {
      throw new Error(
        `ctx.analysis.${kind} requires the analysis engine and it is unavailable`
        + " — check ctx.analysis.available, and declare the check's needs in meta so the report shows the narrowing.",
      );
    }
    execution.modelRequests++;
    const r = runAnalysis({ kind, file, sourceDigest: digest(readSource(file)) }, root);
    if (r.file === undefined || !(kind in r.file)) {
      if (r.error?.startsWith("analysis failed")) {
        recordUnknown({version:SEMANTIC_RESULT_VERSION,status:"unknown",reason:"provider-failure"},file,{capability:kind});
        const empty = kind === "bindings" ? {file,bindings:[]}
          : kind === "spans" ? {file,spans:[]}
          : {file,calls:[],functions:[],differences:[],structure:{
            flow:{values:[],bindings:[],uses:[],loops:[],branches:[],jsxElements:[]},
            values:[],bindings:[],functions:[],loops:[],directives:[],
          }};
        analysisFiles.set(`${kind}:${file}`,empty as AnalysisFile|AnalysisSpans|AnalysisCalls);
        return empty as unknown as T extends "bindings" ? AnalysisFile : T extends "spans" ? AnalysisSpans : AnalysisCalls;
      }
      throw new Error(r.error ?? "ctx.analysis failed");
    }
    analysisFiles.set(`${kind}:${file}`,r.file);
    return r.file as T extends "bindings" ? AnalysisFile : T extends "spans" ? AnalysisSpans : AnalysisCalls;
  };

  const cachedAnalysisFile = <T extends "bindings" | "spans" | "calls">(kind:T,file:string):T extends "bindings" ? AnalysisFile : T extends "spans" ? AnalysisSpans : AnalysisCalls => {
    const cached=analysisFiles.get(`${kind}:${file}`);
    if(cached)execution.modelCacheHits++;
    return (cached??analysisFile(kind,file)) as T extends "bindings" ? AnalysisFile : T extends "spans" ? AnalysisSpans : AnalysisCalls;
  };

  function recordUnknown<T>(result:SemanticResult<T>,file:string,context:{check?:string;capability?:string;recipe?:RecipeName}):SemanticResult<T>{
    if(result.status!=="unknown")return result;
    const key=JSON.stringify([context.check,context.capability,context.recipe,result.reason]);
    const existing=narrowings.get(key);
    if(existing){existing.occurrences++;const affected=existing.files.find(item=>item.file===file);if(affected)affected.occurrences++;else existing.files.push({file,occurrences:1});}
    else narrowings.set(key,{...context,reason:result.reason,occurrences:1,files:[{file,occurrences:1}]});
    return result;
  }

  function semanticRequest<T>(
    kind: "call-identity" | "identity" | "value-path" | "value-disposition" | "resource-lifetime" | "option-presence"
      | RecipeHostKind,
    file: string,
    expression: ExpressionRef,
    query: IdentityQuery | ValuePathQuery | ValueDispositionQuery | ResourceLifetimeQuery | OptionPresenceQuery
      | RegisteredRecipeQuery,
  ): { result: SemanticResult<T>; subject?: SourceRange } {
    execution.semanticQueries++;
    if (analysisForcedOff) {
      return { result: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "analysis-unavailable" } };
    }
    try {
      const response = runAnalysis({ kind, file, expression, query, sourceDigest: digest(readSource(file)) }, root);
      if (response.execution) {
        execution.modelRequests += response.execution.modelRequests;
        execution.modelCacheHits += response.execution.modelCacheHits;
      }
      const result = response.semantic as SemanticResult<T> | undefined;
      if (result) return { result, ...(response.subject ? { subject: response.subject } : {}) };
    } catch {
      // The public semantic interface converts host/channel failures to
      // explicit uncertainty; a Doctor run never treats absence as known.
    }
    return { result: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "provider-failure" } };
  }

  const recipes = {} as DoctorCtx["recipes"];
  for (const definition of Object.values(RECIPE_DEFINITIONS)) {
    (recipes as Record<string, (
      file: string,
      expression: ExpressionRef,
      query: RegisteredRecipeQuery,
      finding: RecipeFinding,
    ) => SemanticResult<RecipeDecision>>)[definition.method] = (file, expression, query, finding) =>
      recipe(definition.name, file, expression, query, finding);
  }

  const ctx: DoctorCtx = {
    root,

    files: {
      list(exts?: string[]): string[] {
        return inventory(root, exts).files.filter(f => f.role !== "generated" && (opts.includeTests || f.role !== "test")).map(f => f.file).sort();
      },
      inventory(): FileInventory {
        return fileInventory ??= inventory(root, [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts", ".cjs"]);
      },

      read(relativePath: string): string {
        return readSource(relativePath);
      },

      readMasked(relativePath: string): string {
        return maskNonCode(readSource(relativePath));
      },
    },

    search: {
      pattern(pattern: string, language: "TypeScript" | "JavaScript" = "TypeScript"): Match[] {
        return runSearch({ op: "pattern", pattern }, language, root, opts.includeTests);
      },

      rule(query: RuleQuery, language: "TypeScript" | "JavaScript" = "TypeScript"): Match[] {
        return runSearch({ op: "rule", rule: validateRuleQuery(query) }, language, root, opts.includeTests);
      },

      rules(queries: NamedRuleQuery[], language: "TypeScript" | "JavaScript" = "TypeScript"): Match[] {
        return runSearch({ op: "rules", rules: validateNamedRuleQueries(queries) }, language, root, opts.includeTests);
      },
    },

    analysis: {
      consumers(file: string) {
        if (!ctx.analysis.available) throw new Error("consumer analysis unavailable");
        if (!project) {
          const response = runAnalysis({ kind: "project" }, root);
          if (!response.project) throw new Error(response.error ?? "consumer analysis failed");
          project = response.project;
          for (const [file, source] of sourceCache) if (project.coverage.sourceDigests[file] && digest(source) !== project.coverage.sourceDigests[file]) throw new Error(`source changed during consumer analysis: ${file}`);
        }
        if (!(file in project.files)) throw new Error(`consumer analysis outside captured inventory: ${file}`);
        return { exports: project.files[file], coverage: project.coverage };
      },
      structures(file: string) {
        if (!ctx.analysis.available) throw new Error("function structure analysis unavailable");
        const response = runAnalysis({ kind: "structures", file, sourceDigest: digest(readSource(file)) }, root);
        if (!response.structures) throw new Error(response.error ?? "function structure analysis failed");
        return response.structures;
      },

      // One channel question, cached per ctx — availability is cheap and
      // honest data, never a guess. The verify harness's forced-off
      // switch (fixture `analysis: "off"`) overrides a present engine so
      // the degraded path is pinnable anywhere.
      get available(): boolean {
        if (availabilityCache === undefined) {
          // No host channel → no analysis: the honest answer for a
          // narrowing decision, not a crash (bindings() is the loud path).
          try {
            const response=runAnalysis({ kind: "available" }, root);
            availabilityCache = Boolean(response.available);
            providerCache=response.provider;
          } catch {
            availabilityCache = false;
          }
        }
        return availabilityCache && !analysisForcedOff;
      },

      bindings(file: string): AnalysisFile {
        return cachedAnalysisFile("bindings", file);
      },

      spans(file: string): AnalysisSpans {
        return cachedAnalysisFile("spans", file);
      },
      calls(file: string): AnalysisCalls {
        return cachedAnalysisFile("calls", file);
      },
      callIdentity(file: string, expression: ExpressionRef, query: IdentityQuery): SemanticResult<{matches:boolean}> {
        return recordUnknown(semanticRequest<{matches:boolean}>("call-identity",file,expression,query).result,file,{capability:"identity"});
      },
      identity(file: string, expression: ExpressionRef, query: IdentityQuery): SemanticResult<IdentityValue> {
        return recordUnknown(semanticRequest<IdentityValue>("identity",file,expression,query).result,file,{capability:"identity"});
      },
      valueAtPath(file:string,subject:ExpressionRef,query:ValuePathQuery):SemanticResult<ValuePathValue>{
        // Value Path is a reusable fact, not a policy decision. The Doctor
        // decides which Check (if any) an unknown answer narrows, so a generic
        // lookup cannot add a duplicate unscoped coverage entry here.
        return semanticRequest<ValuePathValue>("value-path",file,subject,query).result;
      },
      valueDisposition(file: string, expression: ExpressionRef, query: ValueDispositionQuery): SemanticResult<ValueDisposition> {
        return recordUnknown(semanticRequest<ValueDisposition>("value-disposition",file,expression,query).result,file,{capability:"value-disposition"});
      },
      resourceLifetime(file:string,acquisition:ExpressionRef,query:ResourceLifetimeQuery):SemanticResult<ResourceLifetime>{
        return recordUnknown(semanticRequest<ResourceLifetime>("resource-lifetime",file,acquisition,query).result,file,{capability:"resource-lifetime"});
      },
      optionPresence(file:string,call:ExpressionRef,query:OptionPresenceQuery):SemanticResult<OptionPresence>{
        return recordUnknown(semanticRequest<OptionPresence>("option-presence",file,call,query).result,file,{capability:"option-presence"});
      },
    },

    recipes,

    report: {
      finding(f: Finding): void {
        findings.push(f);
      },
      narrowing(n: CustomNarrowing): void {
        if (!n || typeof n !== "object" || Object.keys(n).some(key => !["check", "file", "reason", "capability"].includes(key))
          || typeof n.check !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(n.check)
          || !UNKNOWN_REASONS.includes(n.reason)
          || (n.capability !== undefined && (typeof n.capability !== "string" || !n.capability.length))) {
          throw new Error("invalid custom narrowing: expected check, relative file, structured reason and optional capability");
        }
        if (typeof n.file !== "string" || !n.file.length || /[\\\\:\x00-\x1f]/.test(n.file)
          || path.isAbsolute(n.file) || n.file.split("/").some(part => !part || part === "." || part === "..")) {
          throw new Error("invalid custom narrowing: file must be a normalized relative path");
        }
        // Reuse confinement and snapshot validation, including realpath containment.
        readSource(n.file);
        const capabilities = customChecks.get(n.check) ?? new Set<string>();
        if (n.capability !== undefined) capabilities.add(n.capability);
        customChecks.set(n.check, capabilities);
        recordUnknown({version:SEMANTIC_RESULT_VERSION,status:"unknown",reason:n.reason},n.file,
          {check:n.check,...(n.capability !== undefined ? {capability:n.capability} : {})});
      },
    },
  };

  function recipe(recipeName:RecipeName,file:string,expression:ExpressionRef,query:RegisteredRecipeQuery,finding:RecipeFinding):SemanticResult<RecipeDecision>{
    const kind=RECIPE_DEFINITIONS[recipeName].kind;
    const context={check:finding.rule,recipe:recipeName};
    const response=semanticRequest<RecipeDecision>(kind,file,expression,query);let result=response.result;
    if(result.status==='known'&&result.value==='report'||result.status==='unknown'&&query.reportUnknown?.includes(result.reason)){
      const subject=response.subject;
      if(!subject)return recordUnknown({version:SEMANTIC_RESULT_VERSION,status:'unknown',reason:'source-changed'},file,context);
      ctx.report.finding({rule:finding.rule,file,line:subject.line,column:subject.column,evidence:{endLine:subject.endLine,endColumn:subject.endColumn},...(finding.message?{message:finding.message}:{})});
    }
    return recordUnknown(result,file,context);
  }

  return { ctx, getFindings: () => findings.slice(), getAnalysisCoverage: () => {
    if(project) {
      const files=inventory(root,[".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts", ".cjs", ".json"]).files;
      if(JSON.stringify(files)!==JSON.stringify(project.coverage.inventory.files)) throw new Error("source inventory changed during consumer analysis");
      for(const [file,expected] of Object.entries(project.coverage.sourceDigests)) if(digest(readFileWithin(root,file))!==expected) throw new Error(`source changed during consumer analysis: ${file}`);
    }
    return project?.coverage;
  }, getSemanticReport:(meta:DoctorMeta):SemanticRunReport|undefined=>{
    const checks=meta.checks??[],capabilityNames=[...new Set(checks.flatMap(check=>checkAnalysisNeeds(check)))],recipeDeclarations=checks.flatMap(check=>check.recipe?[{check:check.id,name:check.recipe.name}]:[]);
    // Metadata is authoritative at the run boundary, before any report is serialized.
    for (const [id, capabilities] of customChecks) {
      const check = checks.find(check => check.id === id);
      if (!check) throw new Error(`invalid custom narrowing: undeclared check ${id}`);
      const needs = checkAnalysisNeeds(check);
      if (!needs.length) throw new Error(`invalid custom narrowing: check ${id} must declare semantic needs`);
      for (const capability of capabilities) if (!needs.includes(capability)) {
        throw new Error(`invalid custom narrowing: undeclared capability ${capability} for ${id}`);
      }
    }
    if(!capabilityNames.length&&!recipeDeclarations.length&&!narrowings.size)return undefined;
    for(const [file,source] of sourceCache){
      try{if(digest(readFileWithin(root,file))!==digest(source))recordUnknown({version:SEMANTIC_RESULT_VERSION,status:'unknown',reason:'source-changed'},file,{capability:'source-integrity'});}
      catch{recordUnknown({version:SEMANTIC_RESULT_VERSION,status:'unknown',reason:'source-changed'},file,{capability:'source-integrity'});}
    }
    const available=ctx.analysis.available;
    // This provider implements these public analysis methods. Unknown capability
    // names must not inherit the provider's overall availability by accident.
    const supported = new Set<string>(ANALYSIS_CAPABILITY_NAMES);
    const capabilityAvailable = (name: string) => available && supported.has(name);
    const unavailableReason=providerCache?.reason??"analysis engine unavailable";
    const provider=providerCache??{id:"any-doctor/syntax-flow",version:"1",available, ...(!available?{reason:unavailableReason}:{}),dependencies:[]};
    const synthesized:SemanticNarrowing[]=[];
    for(const check of checks.filter(check=>checkAnalysisNeeds(check).some(name=>!capabilityAvailable(name)))) {
      if(check.recipe)synthesized.push({check:check.id,recipe:check.recipe.name,reason:"analysis-unavailable",occurrences:0,files:[]});
      else if(checkAnalysisNeeds(check).length)synthesized.push({check:check.id,reason:"analysis-unavailable",occurrences:0,files:[]});
    }
    const narrowed=[...narrowings.values(),...synthesized];
    return {protocolVersion:SEMANTIC_RESULT_VERSION,provider,capabilities:capabilityNames.map(name=>({name,available:capabilityAvailable(name),...(!capabilityAvailable(name)?{reason:supported.has(name)?unavailableReason:"unsupported analysis capability"}:{})})),recipes:recipeDeclarations.map(item=>({...item,available,...(!available?{reason:unavailableReason}:{})})),narrowed,incomplete:narrowed.length>0,execution:{...execution}};
  } };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The one read with one guard: an explicit path is a doctor's deliberate
// choice (never test-path filtered), but it must stay inside the repo —
// both read and readMasked pass through here, through the strict
// containment form (withinDir in contract.ts; no mktemp anchor carve-out
// — a repo root is a directory, not a prefix).
function readFileWithin(root: string, relativePath: string): string {
  const abs = path.resolve(root, relativePath);
  if (!withinDir(abs, root)) {
    throw new Error(`ctx.files read escapes the repo root: ${relativePath}`);
  }
  if (!withinDir(fs.realpathSync(abs), fs.realpathSync(root))) throw new Error(`ctx.files read escapes the repo root: ${relativePath}`);
  return fs.readFileSync(abs, "utf8");
}

// Rule queries are curated (D20 Stage 1): pattern + inside, nothing else.
// Validation runs BEFORE the host is asked, and errors teach — an agent
// that misspells a key gets the allowed list and the nearest match, not
// a rule that silently matches nothing (the repair log's silent-schema
// lesson, refused at the seam this time).
const RULE_KEYS = ["pattern", "inside"];
const INSIDE_KEYS = ["pattern", "stopBy"];

function validateRuleQuery(query: RuleQuery): RuleQuery {
  if (typeof query !== "object" || query === null || Array.isArray(query)) {
    throw new Error('ctx.search.rule needs a query object: { pattern, inside? }');
  }
  const record = query as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!RULE_KEYS.includes(key)) {
      throw new Error(`ctx.search.rule: unknown key "${key}"${didYouMean(key, RULE_KEYS)} — allowed: ${RULE_KEYS.join(", ")}`);
    }
  }
  const pattern = record.pattern;
  if (typeof pattern !== "string" || pattern === "") {
    throw new Error('ctx.search.rule needs a "pattern" string (the structural pattern to match)');
  }
  const out: RuleQuery = { pattern };
  const inside = record.inside;
  if (inside !== undefined) {
    if (typeof inside !== "object" || inside === null || Array.isArray(inside)) {
      throw new Error('ctx.search.rule: "inside" must be an object: { pattern, stopBy? }');
    }
    for (const key of Object.keys(inside)) {
      if (!INSIDE_KEYS.includes(key)) {
        throw new Error(`ctx.search.rule: unknown key "${key}" inside "inside"${didYouMean(key, INSIDE_KEYS)} — allowed: ${INSIDE_KEYS.join(", ")}`);
      }
    }
    const inner = inside as Record<string, unknown>;
    if (typeof inner.pattern !== "string" || inner.pattern === "") {
      throw new Error('ctx.search.rule: "inside" needs a "pattern" string (the enclosing construct)');
    }
    if (inner.stopBy !== undefined && inner.stopBy !== "end" && inner.stopBy !== "neighbor") {
      throw new Error(`ctx.search.rule: "inside.stopBy" must be "end" or "neighbor" — got ${JSON.stringify(inner.stopBy)} (default is "end")`);
    }
    out.inside = { pattern: inner.pattern, ...(inner.stopBy !== undefined ? { stopBy: inner.stopBy } : {}) };
  }
  return out;
}

function didYouMean(got: string, allowed: string[]): string {
  const near = allowed.find((a) => a.includes(got) || got.includes(a) || levenshtein(got, a) <= 2);
  return near && near !== got ? ` — did you mean "${near}"?` : "";
}

// The multi-rule batch: same curation as a single rule, plus ids —
// unique, non-empty strings, because every match comes back tagged with
// the id of the rule that found it.
function validateNamedRuleQueries(queries: NamedRuleQuery[]): NamedRuleQuery[] {
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error("ctx.search.rules needs a non-empty array of named rules: [{ id, pattern, inside? }]");
  }
  const seen = new Set<string>();
  return queries.map((q) => {
    if (typeof q !== "object" || q === null) {
      throw new Error('ctx.search.rules: each rule must be an object { id, pattern, inside? }');
    }
    const record = q as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!["id", ...RULE_KEYS].includes(key)) {
        throw new Error(`ctx.search.rules: unknown key "${key}"${didYouMean(key, RULE_KEYS)} — allowed: id, ${RULE_KEYS.join(", ")}`);
      }
    }
    if (typeof record.id !== "string" || record.id === "") {
      throw new Error('ctx.search.rules: every rule needs an "id" string — matches come back tagged with it');
    }
    if (seen.has(record.id)) {
      throw new Error(`ctx.search.rules: duplicate id "${record.id}" — ids must be unique`);
    }
    seen.add(record.id);
    const validated = validateRuleQuery({ pattern: record.pattern, ...(record.inside !== undefined ? { inside: record.inside as never } : {}) } as RuleQuery);
    return { id: record.id, ...validated };
  });
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// ctx.search runs the Engine — never by spawning from inside the doctor
// process: doctors execute under Confinement, which denies subprocesses, so
// the host owns the engine and answers over a dedicated channel (request
// out fd 3, result back on stdin). There is exactly one path: without a
// host channel, ctx.search fails loudly rather than silently running
// ast-grep unconfined. Rule failures carry the query alongside the
// engine's own complaint — the author debugs the real message, not a
// flattened one.
interface SearchResponse {
  matches?: RawSgMatch[];
  error?: string;
}

function runSearch(query: EngineQuery, language: "TypeScript" | "JavaScript", root: string, includeTests?: boolean): Match[] {
  let response: SearchResponse;
  try {
    const body =
      query.op === "rule"
        ? { op: query.op, rule: query.rule, language, root, includeTests }
        : query.op === "rules"
          ? { op: query.op, rules: query.rules, language, root, includeTests }
          : { op: query.op, pattern: query.pattern, language, root, includeTests };
    fs.writeSync(3, SEARCH_REQUEST + JSON.stringify(body) + "\n");
    response = readSearchResponse();
  } catch (e) {
    throw new Error(
      `ctx.search is unavailable — no search host on this channel (${e instanceof Error ? e.message : String(e)}). `
      + "Doctors run through any-doctor; a bare doctor-loader.mjs invocation has no host.",
    );
  }
  if (response.error !== undefined) {
    const detail = query.op === "rule"
      ? `${response.error}\nquery: ${JSON.stringify(query.rule)}`
      : query.op === "rules"
        ? `${response.error}\nrules: ${JSON.stringify(query.rules.map((r) => r.id))}`
        : response.error;
    throw new Error(detail);
  }
  return toMatches(response.matches ?? [], root);
}

// The analysis channel call: same transport, op family member. Responses
// carry either the identity model or an error — availability is a normal
// answer, never a thrown guess.
interface AnalysisResponse {
  project?: ProjectConsumers;
  structures?: FunctionStructure[];
  available?: boolean;
  reason?: string;
  provider?: SemanticProviderProvenance;
  file?: AnalysisFile | AnalysisSpans | AnalysisCalls;
  semantic?: SemanticResult<IdentityValue | { matches: boolean } | ValuePathValue | ValueDisposition | ResourceLifetime | OptionPresence | RecipeDecision>;
  execution?: { modelRequests: number; modelCacheHits: number };
  subject?: SourceRange;
  error?: string;
}

type AnalysisRequest = {
  kind: "project" | "structures" | "available" | "bindings" | "spans" | "calls"
    | "call-identity" | "identity" | "value-path" | "value-disposition" | "resource-lifetime" | "option-presence"
    | RecipeHostKind;
  file?: string;
  sourceDigest?: string;
  expression?: ExpressionRef;
  query?: IdentityQuery | ValuePathQuery | ValueDispositionQuery | ResourceLifetimeQuery | OptionPresenceQuery
    | RegisteredRecipeQuery;
};

function runAnalysis(body: AnalysisRequest, root: string): AnalysisResponse {
  let response: AnalysisResponse;
  try {
    fs.writeSync(3, SEARCH_REQUEST + JSON.stringify({ op: "analysis", ...body, root }) + "\n");
    response = readSearchResponse() as unknown as AnalysisResponse;
  } catch (e) {
    throw new Error(
      `ctx.analysis is unavailable — no host on this channel (${e instanceof Error ? e.message : String(e)}). `
      + "Doctors run through any-doctor; a bare doctor-loader.mjs invocation has no host.",
    );
  }
  return response;
}

function readSearchResponse(): SearchResponse {
  const chunk = Buffer.alloc(65536);
  let buffer = "";
  for (;;) {
    const n = fs.readSync(0, chunk, 0, chunk.length, null);
    if (n === 0) throw new Error("search host channel closed");
    buffer += chunk.toString("utf8", 0, n);
    const nl = buffer.indexOf("\n");
    if (nl !== -1) {
      const line = buffer.slice(0, nl);
      if (line.startsWith(SEARCH_RESULT)) {
        return JSON.parse(line.slice(SEARCH_RESULT.length)) as SearchResponse;
      }
      buffer = buffer.slice(nl + 1);
    }
  }
}

// The engine's raw match becomes the doctor's Match: extent and captures
// kept, sigils stripped ($$$ARGS arrives as captures.ARGS — an array for
// multi-metavariables, a single Capture otherwise). Lines are 1-based;
// columns pass through as the engine reports them, as they always have.
function toMatches(raw: RawSgMatch[], root: string, includeTests?: boolean): Match[] {
  return raw.map(m => {
    const captures = capturesOf(m);
    return {
      file: (m.file || "").replace(new RegExp("^" + escapeRegExp(root) + "/"), ""),
      line: (m.range?.start?.line ?? 0) + 1,
      column: (m.range?.start?.column ?? 1),
      text: m.text || "",
      ...(m.ruleId !== undefined ? { ruleId: m.ruleId } : {}),
      ...(m.range?.end !== undefined ? { endLine: (m.range.end.line ?? 0) + 1, endColumn: m.range.end.column ?? 0 } : {}),
      ...(captures !== undefined ? { captures } : {}),
    };
  });
}

function capturesOf(m: RawSgMatch): Record<string, Capture | Capture[]> | undefined {
  const single = m.metaVariables?.single;
  const multi = m.metaVariables?.multi;
  if (single === undefined && multi === undefined) return undefined;
  const out: Record<string, Capture | Capture[]> = {};
  for (const [key, capture] of Object.entries(single ?? {})) {
    out[key.replace(/^\$+/, "")] = toCapture(capture);
  }
  for (const [key, captures] of Object.entries(multi ?? {})) {
    // ast-grep's multi-captures include separator tokens (`","` between
    // arguments) as their own captures — dialect noise the seam absorbs:
    // a multi-capture array is the captured NODES, never the commas.
    out[key.replace(/^\$+/, "")] = (captures ?? [])
      .filter((c) => (c.text ?? "").trim() !== ",")
      .map(toCapture);
  }
  return out;
}

function toCapture(c: RawSgCapture): Capture {
  return {
    text: c.text ?? "",
    line: (c.range?.start?.line ?? 0) + 1,
    column: c.range?.start?.column ?? 0,
    endLine: (c.range?.end?.line ?? 0) + 1,
    endColumn: c.range?.end?.column ?? 0,
  };
}
