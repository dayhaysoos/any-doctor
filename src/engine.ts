import { spawnSync } from "child_process";
import * as fs from "fs";
import { createRequire } from "module";
import * as path from "path";
import { NamedRuleQuery, RuleQuery } from "./contract.js";

// The Engine: the one place that knows how to run ast-grep. The search
// host sits on it — there is exactly one path from ctx.search to here
// (the sdk asks the host; a channel-less ctx.search fails loudly, so no
// unconfined route exists). CONTEXT.md names this seam: ast-grep today; a
// different backend slots in here alone.
//
// The binary ships WITH the package (@ast-grep/cli, its platform binaries
// as npm optionalDependencies — the same distribution pattern as oxc).
// A user installs nothing: npx/npm install pulls the right platform
// binary automatically. Resolution order, one home, tried once and cached:
//   1. the postinstall copy inside @ast-grep/cli,
//   2. the platform package's own binary (present even under
//      --ignore-scripts, where postinstall never ran),
//   3. ast-grep on PATH, then sg (for machines that already have it),
//   4. the loud error — unsupported platforms only.
const require_ = createRequire(import.meta.url);

let cachedBinary: string | null | undefined;

export function resolveAstGrepBinary(): string | null {
  if (cachedBinary !== undefined) return cachedBinary;
  const candidates: string[] = [];
  try {
    const pkgRoot = path.dirname(require_.resolve("@ast-grep/cli/package.json"));
    candidates.push(path.join(pkgRoot, "ast-grep"), path.join(pkgRoot, "ast-grep.exe"));
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8")) as { optionalDependencies?: Record<string, string> };
    const platformSuffix = `-${process.platform}-${process.arch}`;
    for (const dep of Object.keys(pkg.optionalDependencies ?? {})) {
      if (dep.includes(platformSuffix)) {
        try {
          const depRoot = path.dirname(require_.resolve(`${dep}/package.json`));
          candidates.push(path.join(depRoot, "ast-grep"), path.join(depRoot, "ast-grep.exe"));
        } catch {
          // not installed on this machine — next candidate
        }
      }
    }
  } catch {
    // @ast-grep/cli absent (unsupported install) — PATH is next
  }
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      cachedBinary = candidate;
      return cachedBinary;
    } catch {
      // next candidate
    }
  }
  cachedBinary = null;
  return null;
}
//
// Three query shapes, one interface: a bare pattern (ast-grep run), a
// Rule query (ast-grep scan --inline-rules) — pattern + inside, the
// composite questions regex cannot ask honestly — and the multi-rule
// batch: several named rules in ONE invocation, because every spawn
// costs a process start (~85ms wall regardless of repo size) and a
// check with many shapes must not pay that per question.

export type EngineQuery =
  | { op: "pattern"; pattern: string }
  | { op: "rule"; rule: RuleQuery }
  | { op: "rules"; rules: NamedRuleQuery[] };

// ast-grep's JSON wire shapes, kept whole (D20 Stage 1: the seam stopped
// subtracting structure). End ranges and metavariable captures flow
// through to the sdk's Match mapping.
interface RawSgPos {
  line?: number;
  column?: number;
}

interface RawSgRange {
  start?: RawSgPos;
  end?: RawSgPos;
}

export interface RawSgMatch {
  file?: string;
  text?: string;
  lines?: string;
  language?: string;
  ruleId?: string;
  range?: RawSgRange;
  metaVariables?: {
    single?: Record<string, RawSgCapture>;
    multi?: Record<string, RawSgCapture[]>;
  };
}

export interface RawSgCapture {
  text?: string;
  range?: RawSgRange;
}

export type EngineResult = { ok: true; matches: RawSgMatch[] } | { ok: false; error: string };

// One batched query over a real repo emits tens of megabytes of JSON (the
// async-doctor pilot's ten patterns produce 24MB over a 979-file repo) —
// spawnSync's 1MB default truncates that mid-array, and the crash reads as
// an ast-grep bug instead of a buffer bug. The ceiling exists so a runaway
// pattern (matching near-every node of a monorepo) fails loudly here
// instead of buffering without end.
const MAX_BUFFER_BYTES = 256 * 1024 * 1024;

// ast-grep renamed its binary; old installs only have `sg`. Try the new
// name first (no deprecation warning on stderr), fall back once. The
// spawn options are one const so the fallback cannot drift from the
// first try.
const SPAWN_OPTS = { encoding: "utf8" as const, timeout: 120000, maxBuffer: MAX_BUFFER_BYTES };

function invoke(args: string[], root: string) {
  const bundled = resolveAstGrepBinary();
  if (bundled !== null) {
    return spawnSync(bundled, [...args, root], SPAWN_OPTS);
  }
  // No bundled binary (unsupported platform or stripped install): the
  // user's own ast-grep, then its old name.
  let r = spawnSync("ast-grep", [...args, root], SPAWN_OPTS);
  if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") {
    r = spawnSync("sg", [...args, root], SPAWN_OPTS);
  }
  return r;
}

function missingEngine(r: ReturnType<typeof spawnSync>): boolean {
  return Boolean(r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT");
}

// spawnSync reports an exceeded maxBuffer as ENOBUFS (verified Node 14–26;
// ERR_CHILD_PROCESS_STDIO_MAXBUFFER is the streams-side name and is kept
// for belt and braces). The distinction matters: without this check the
// truncated stdout falls through to JSON.parse and surfaces as a
// misleading "unparseable output" complaint.
export function isBufferOverflow(r: { error?: unknown }): boolean {
  const code = (r.error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOBUFS" || code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
}

// Rule queries need `scan --inline-rules`, which older ast-greps lack.
// A clap complaint about the flag or the subcommand is an age problem,
// not a rule problem — say so instead of forwarding CLI noise.
function tooOld(stderr: string): boolean {
  return /--inline-rules|unrecognized subcommand|unexpected argument/.test(stderr);
}

export function runEngine(query: EngineQuery, language: string, root: string): EngineResult {
  let args: string[];
  if (query.op === "pattern") {
    args = ["run", "-p", query.pattern, "-l", language, "--json"];
  } else if (query.op === "rule") {
    args = ["scan", "--inline-rules", JSON.stringify({ language, rule: toSgRule(query.rule) }), "--json"];
  } else {
    // ast-grep accepts multiple inline rules separated by a `---` line;
    // each match comes back tagged with its rule's id.
    args = [
      "scan",
      "--inline-rules",
      query.rules.map((r) => JSON.stringify({ id: r.id, language, rule: toSgRule(r) })).join("\n---\n"),
      "--json",
    ];
  }

  const r = invoke(args, root);
  if (missingEngine(r)) {
    return {
      ok: false,
      error: "ctx.search needs the ast-grep engine: it ships with any-doctor (@ast-grep/cli installs the binary for your platform automatically). It was not found in this install and is not on PATH — reinstall any-doctor, or install ast-grep separately and put it on PATH.",
    };
  }
  if (isBufferOverflow(r)) {
    return {
      ok: false,
      error: `ctx.search outgrew the engine's ${MAX_BUFFER_BYTES / (1024 * 1024)}MB output buffer — the query matches too much code for one batch; narrow the patterns or split the batch`,
    };
  }
  if (r.status !== 0 && !String(r.stdout).trim()) {
    if (query.op !== "pattern" && tooOld(String(r.stderr))) {
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
