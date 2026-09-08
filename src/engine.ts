import { spawnSync } from "child_process";
import { RuleQuery } from "./contract.js";

// The Engine: the one place that knows how to run ast-grep. The search
// host sits on it — there is exactly one path from ctx.search to here
// (the sdk asks the host; a channel-less ctx.search fails loudly, so no
// unconfined route exists). CONTEXT.md names this seam: ast-grep today; a
// different backend slots in here alone.
//
// Two query shapes, one interface: a bare pattern (ast-grep run) and a
// Rule query (ast-grep scan --inline-rules) — pattern + inside, the
// composite questions regex cannot ask honestly.

export type EngineQuery =
  | { op: "pattern"; pattern: string }
  | { op: "rule"; rule: RuleQuery };

// The raw JSON ast-grep emits, kept whole (D20 Stage 1: the seam stopped
// subtracting structure). end ranges and metavariable captures flow
// through to the sdk's Match mapping.
export interface RawSgMatch {
  file?: string;
  text?: string;
  lines?: string;
  language?: string;
  range?: {
    start?: { line?: number; column?: number };
    end?: { line?: number; column?: number };
  };
  metaVariables?: {
    single?: Record<string, RawSgCapture>;
    multi?: Record<string, RawSgCapture[]>;
  };
}

export interface RawSgCapture {
  text?: string;
  range?: {
    start?: { line?: number; column?: number };
    end?: { line?: number; column?: number };
  };
}

export type EngineResult = { ok: true; matches: RawSgMatch[] } | { ok: false; error: string };

// ast-grep renamed its binary; old installs only have `sg`. Try the new
// name first (no deprecation warning on stderr), fall back once.
function invoke(args: string[], root: string) {
  let r = spawnSync("ast-grep", [...args, root], { encoding: "utf8", timeout: 120000 });
  if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") {
    r = spawnSync("sg", [...args, root], { encoding: "utf8", timeout: 120000 });
  }
  return r;
}

function missingEngine(r: ReturnType<typeof spawnSync>): boolean {
  return Boolean(r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT");
}

// Rule queries need `scan --inline-rules`, which older ast-greps lack.
// A clap complaint about the flag or the subcommand is an age problem,
// not a rule problem — say so instead of forwarding CLI noise.
function tooOld(stderr: string): boolean {
  return /--inline-rules|unrecognized subcommand|unexpected argument/.test(stderr);
}

export function runEngine(query: EngineQuery, language: string, root: string): EngineResult {
  const args =
    query.op === "pattern"
      ? ["run", "-p", query.pattern, "-l", language, "--json"]
      : ["scan", "--inline-rules", JSON.stringify({ language, rule: toSgRule(query.rule) }), "--json"];

  const r = invoke(args, root);
  if (missingEngine(r)) {
    return { ok: false, error: "ctx.search requires ast-grep (ast-grep or sg) on PATH — install: brew install ast-grep" };
  }
  if (r.status !== 0 && !String(r.stdout).trim()) {
    if (query.op === "rule" && tooOld(String(r.stderr))) {
      return { ok: false, error: "ctx.search.rule requires a newer ast-grep (no scan --inline-rules support) — upgrade: brew upgrade ast-grep" };
    }
    return { ok: false, error: "ctx.search failed: " + (r.stderr || "ast-grep exited " + r.status) };
  }
  try {
    return { ok: true, matches: JSON.parse(String(r.stdout)) as RawSgMatch[] };
  } catch {
    return {
      ok: false,
      error: `ctx.search produced unparseable output from ast-grep — refusing to report a false green. First bytes: ${JSON.stringify(String(r.stdout).slice(0, 120))}`,
    };
  }
}

// The curated subset, translated to ast-grep's rule dialect. stopBy
// defaults to "end" HERE — one home for the divergence from ast-grep's
// own neighbor default, so every consumer gets it without remembering.
function toSgRule(query: RuleQuery): Record<string, unknown> {
  const rule: Record<string, unknown> = { pattern: query.pattern };
  if (query.inside) {
    rule.inside = { pattern: query.inside.pattern, stopBy: query.inside.stopBy ?? "end" };
  }
  return rule;
}
