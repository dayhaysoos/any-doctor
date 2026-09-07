import * as fs from "fs";
import * as path from "path";
import { DoctorCtx, Finding, isTestPath, Match, SEARCH_REQUEST, SEARCH_RESULT } from "./contract.js";
import { RawSgMatch } from "./engine.js";

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
        const abs = path.resolve(root, relativePath);
        if (abs !== root && !abs.startsWith(root + path.sep)) {
          throw new Error(`ctx.files.read escapes the repo root: ${relativePath}`);
        }
        return fs.readFileSync(abs, "utf8");
      },
    },

    search: {
      pattern(pattern: string, language: "TypeScript" | "JavaScript" = "TypeScript"): Match[] {
        return runSearch(pattern, language, root);
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

// ctx.search runs the Engine — never by spawning from inside the doctor
// process: doctors execute under Confinement, which denies subprocesses, so
// the host owns the engine and answers over a dedicated channel (request
// out fd 3, result back on stdin). There is exactly one path: without a
// host channel, ctx.search fails loudly rather than silently running
// ast-grep unconfined.
interface SearchResponse {
  matches?: RawSgMatch[];
  error?: string;
}

function runSearch(pattern: string, language: "TypeScript" | "JavaScript", root: string): Match[] {
  let response: SearchResponse;
  try {
    fs.writeSync(3, SEARCH_REQUEST + JSON.stringify({ pattern, language, root }) + "\n");
    response = readSearchResponse();
  } catch (e) {
    throw new Error(
      `ctx.search is unavailable — no search host on this channel (${e instanceof Error ? e.message : String(e)}). `
      + "Doctors run through any-doctor; a bare doctor-loader.mjs invocation has no host.",
    );
  }
  if (response.error !== undefined) throw new Error(response.error);
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

function toMatches(raw: RawSgMatch[], root: string): Match[] {
  return raw.map(m => ({
    file: (m.file || "").replace(new RegExp("^" + escapeRegExp(root) + "/"), ""),
    line: (m.range?.start?.line ?? 0) + 1,
    column: (m.range?.start?.column ?? 1),
    text: m.text || "",
  }));
}
