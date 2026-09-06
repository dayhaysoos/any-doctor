import { spawnSync } from "child_process";

// The Engine: the one place that knows how to run ast-grep. The search
// host sits on it — there is exactly one path from ctx.search to here
// (the sdk asks the host; a channel-less ctx.search fails loudly, so no
// unconfined route exists). CONTEXT.md names this seam: ast-grep today; a
// different backend slots in here alone.
export interface RawSgMatch {
  file?: string;
  text?: string;
  range?: { start?: { line?: number; column?: number } };
}

export type EngineResult = { ok: true; matches: RawSgMatch[] } | { ok: false; error: string };

export function runEngineSearch(pattern: string, language: string, root: string): EngineResult {
  const r = spawnSync("sg", ["run", "-p", pattern, "-l", language, "--json", root], {
    encoding: "utf8",
    timeout: 120000,
  });
  if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") {
    return { ok: false, error: "ctx.search requires ast-grep (sg) on PATH — install: brew install ast-grep" };
  }
  if (r.status !== 0 && !r.stdout.trim()) {
    return { ok: false, error: "ctx.search failed: " + (r.stderr || "sg exited " + r.status) };
  }
  try {
    return { ok: true, matches: JSON.parse(r.stdout) as RawSgMatch[] };
  } catch {
    return {
      ok: false,
      error: `ctx.search produced unparseable output from sg — refusing to report a false green. First bytes: ${JSON.stringify(r.stdout.slice(0, 120))}`,
    };
  }
}
