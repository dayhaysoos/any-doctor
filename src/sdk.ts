import { createHash } from "node:crypto";
import { inventory } from "./file-scope.js";
import type { FileInventory } from "./file-scope.js";
import type { ProjectConsumers } from "./project-consumers.js";
import type { FunctionStructure } from "./function-structure.js";
import * as fs from "fs";
import * as path from "path";
import { AnalysisFile, AnalysisSpans, AnalysisCalls, Capture, DEFAULT_EXTS, DoctorCtx, ExpressionRef, Finding, IdentityQuery, IdentityValue, isTestPath, Match, NamedRuleQuery, OptionPresence, OptionPresenceQuery, ResourceLifetime, ResourceLifetimeQuery, RuleQuery, SEARCH_REQUEST, SEARCH_RESULT, SemanticResult, SEMANTIC_RESULT_VERSION, ValueDisposition, ValueDispositionQuery, withinDir } from "./contract.js";
import { maskNonCode } from "./mask.js";
import { EngineQuery, RawSgCapture, RawSgMatch } from "./engine.js";

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
export function buildCtx(root: string, opts: { includeTests?: boolean } = {}): { ctx: DoctorCtx; getFindings(): Finding[]; getAnalysisCoverage(): ProjectConsumers["coverage"] | undefined } {
  const findings: Finding[] = [];
  const sourceCache = new Map<string,string>();
  const digest = (source: string) => createHash("sha256").update(source).digest("hex");
  function readSource(file: string): string {
    let source=sourceCache.get(file);
    if(source===undefined) {source=readFileWithin(root,file);sourceCache.set(file,source);}
    return source;
  }
  let availabilityCache: boolean | undefined;

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
    const r = runAnalysis({ kind, file, sourceDigest: digest(readSource(file)) }, root);
    if (r.file === undefined || !(kind in r.file)) throw new Error(r.error ?? "ctx.analysis failed");
    return r.file as T extends "bindings" ? AnalysisFile : T extends "spans" ? AnalysisSpans : AnalysisCalls;
  };

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
            availabilityCache = Boolean(runAnalysis({ kind: "available" }, root).available);
          } catch {
            availabilityCache = false;
          }
        }
        return availabilityCache && !analysisForcedOff;
      },

      bindings(file: string): AnalysisFile {
        return analysisFile("bindings", file);
      },

      spans(file: string): AnalysisSpans {
        return analysisFile("spans", file);
      },
      calls(file: string): AnalysisCalls {
        return analysisFile("calls", file);
      },
      identity(file: string, expression: ExpressionRef, query: IdentityQuery): SemanticResult<IdentityValue> {
        if (analysisForcedOff || !ctx.analysis.available) return { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "analysis-unavailable" };
        try {
          const response = runAnalysis({ kind: "identity", file, expression, query, sourceDigest: digest(readSource(file)) }, root);
          if (response.semantic) return response.semantic as SemanticResult<IdentityValue>;
          return { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "provider-failure" };
        } catch {
          return { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "provider-failure" };
        }
      },
      valueDisposition(file: string, expression: ExpressionRef, query: ValueDispositionQuery): SemanticResult<ValueDisposition> {
        if (analysisForcedOff || !ctx.analysis.available) return { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "analysis-unavailable" };
        try {
          const response = runAnalysis({ kind: "value-disposition", file, expression, query, sourceDigest: digest(readSource(file)) }, root);
          if (response.semantic) return response.semantic as SemanticResult<ValueDisposition>;
          return { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "provider-failure" };
        } catch { return { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "provider-failure" }; }
      },
      resourceLifetime(file:string,acquisition:ExpressionRef,query:ResourceLifetimeQuery):SemanticResult<ResourceLifetime>{
        if(analysisForcedOff||!ctx.analysis.available)return {version:SEMANTIC_RESULT_VERSION,status:'unknown',reason:'analysis-unavailable'};
        try{const response=runAnalysis({kind:'resource-lifetime',file,expression:acquisition,query,sourceDigest:digest(readSource(file))},root);if(response.semantic)return response.semantic as SemanticResult<ResourceLifetime>;return {version:SEMANTIC_RESULT_VERSION,status:'unknown',reason:'provider-failure'};}catch{return {version:SEMANTIC_RESULT_VERSION,status:'unknown',reason:'provider-failure'};}
      },
      optionPresence(file:string,call:ExpressionRef,query:OptionPresenceQuery):SemanticResult<OptionPresence>{
        if(analysisForcedOff||!ctx.analysis.available)return {version:SEMANTIC_RESULT_VERSION,status:'unknown',reason:'analysis-unavailable'};
        try{const response=runAnalysis({kind:'option-presence',file,expression:call,query,sourceDigest:digest(readSource(file))},root);if(response.semantic)return response.semantic as SemanticResult<OptionPresence>;return {version:SEMANTIC_RESULT_VERSION,status:'unknown',reason:'provider-failure'};}catch{return {version:SEMANTIC_RESULT_VERSION,status:'unknown',reason:'provider-failure'};}
      },
    },

    report: {
      finding(f: Finding): void {
        findings.push(f);
      },
    },
  };

  return { ctx, getFindings: () => findings.slice(), getAnalysisCoverage: () => {
    if(project) {
      const files=inventory(root,[".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts", ".cjs", ".json"]).files;
      if(JSON.stringify(files)!==JSON.stringify(project.coverage.inventory.files)) throw new Error("source inventory changed during consumer analysis");
      for(const [file,expected] of Object.entries(project.coverage.sourceDigests)) if(digest(readFileWithin(root,file))!==expected) throw new Error(`source changed during consumer analysis: ${file}`);
    }
    return project?.coverage;
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
  file?: AnalysisFile | AnalysisSpans | AnalysisCalls;
  semantic?: SemanticResult<IdentityValue | ValueDisposition | ResourceLifetime | OptionPresence>;
  error?: string;
}

function runAnalysis(body: { kind: "project" } | { kind: "structures"; file: string; sourceDigest?: string } | { kind: "available" } | { kind: "bindings"; file: string; sourceDigest?: string } | { kind: "spans"; file: string; sourceDigest?: string } | { kind: "calls"; file: string; sourceDigest?: string } | { kind: "identity"; file: string; expression: ExpressionRef; query: IdentityQuery; sourceDigest?: string } | {kind:"value-disposition";file:string;expression:ExpressionRef;query:ValueDispositionQuery;sourceDigest?:string}|{kind:'resource-lifetime';file:string;expression:ExpressionRef;query:ResourceLifetimeQuery;sourceDigest?:string}|{kind:'option-presence';file:string;expression:ExpressionRef;query:OptionPresenceQuery;sourceDigest?:string}, root: string): AnalysisResponse {
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
