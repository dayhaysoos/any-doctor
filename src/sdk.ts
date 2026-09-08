import * as fs from "fs";
import * as path from "path";
import { Capture, DoctorCtx, Finding, isTestPath, Match, RuleQuery, SEARCH_REQUEST, SEARCH_RESULT } from "./contract.js";
import { maskNonCode } from "./mask.js";
import { EngineQuery, RawSgCapture, RawSgMatch } from "./engine.js";

const DEFAULT_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

// Production posture (D18): ctx.files.list() excludes test paths — tests
// mimic production shapes without being production reads. The law itself
// (isTestPath) and the run/verify derivation live in contract.ts; a run
// opts back in with --include-tests. ctx.files.read() is never filtered:
// an explicit path is a doctor's deliberate choice.
export function buildCtx(root: string, opts: { includeTests?: boolean } = {}): { ctx: DoctorCtx; getFindings(): Finding[] } {
  const findings: Finding[] = [];

  function walk(dir: string, exts: Set<string>, out: string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      // One predicate for files and directories: a test directory prunes
      // the whole subtree; a test-named file is skipped alone.
      if (!opts.includeTests && isTestPath(rel)) continue;
      if (entry.isDirectory()) walk(abs, exts, out);
      else if (exts.has(path.extname(entry.name))) out.push(rel);
    }
  }

  const ctx: DoctorCtx = {
    root,

    files: {
      list(exts?: string[]): string[] {
        const extSet = new Set((exts && exts.length ? exts : DEFAULT_EXTS)
          .map(e => (e.startsWith(".") ? e : "." + e)));
        const out: string[] = [];
        walk(root, extSet, out);
        return out.sort();
      },

      read(relativePath: string): string {
        return readFileWithin(root, relativePath);
      },

      readMasked(relativePath: string): string {
        return maskNonCode(readFileWithin(root, relativePath));
      },
    },

    search: {
      pattern(pattern: string, language: "TypeScript" | "JavaScript" = "TypeScript"): Match[] {
        return runSearch({ op: "pattern", pattern }, language, root);
      },

      rule(query: RuleQuery, language: "TypeScript" | "JavaScript" = "TypeScript"): Match[] {
        return runSearch({ op: "rule", rule: validateRuleQuery(query) }, language, root);
      },
    },

    report: {
      finding(f: Finding): void {
        findings.push(f);
      },
    },
  };

  return { ctx, getFindings: () => findings.slice() };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The one read with one guard: an explicit path is a doctor's deliberate
// choice (never test-path filtered), but it must stay inside the repo.
function readFileWithin(root: string, relativePath: string): string {
  const abs = path.resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`ctx.files.read escapes the repo root: ${relativePath}`);
  }
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

function runSearch(query: EngineQuery, language: "TypeScript" | "JavaScript", root: string): Match[] {
  let response: SearchResponse;
  try {
    const body = query.op === "rule"
      ? { op: query.op, rule: query.rule, language, root }
      : { op: query.op, pattern: query.pattern, language, root };
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
      : response.error;
    throw new Error(detail);
  }
  return toMatches(response.matches ?? [], root);
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
function toMatches(raw: RawSgMatch[], root: string): Match[] {
  return raw.map(m => ({
    file: (m.file || "").replace(new RegExp("^" + escapeRegExp(root) + "/"), ""),
    line: (m.range?.start?.line ?? 0) + 1,
    column: (m.range?.start?.column ?? 1),
    text: m.text || "",
    ...(m.range?.end !== undefined ? { endLine: (m.range.end.line ?? 0) + 1, endColumn: m.range.end.column ?? 0 } : {}),
    ...(capturesOf(m) !== undefined ? { captures: capturesOf(m) } : {}),
  }));
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
