import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { DoctorCtx, Finding, Match } from "./contract.js";

interface RawSgMatch {
  file?: string;
  text?: string;
  range?: { start?: { line?: number; column?: number } };
}

const DEFAULT_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

export function buildCtx(root: string): { ctx: DoctorCtx; getFindings(): Finding[] } {
  const findings: Finding[] = [];

  function walk(dir: string, exts: Set<string>, out: string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, exts, out);
      else if (exts.has(path.extname(entry.name))) out.push(path.relative(root, abs));
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
        return fs.readFileSync(path.join(root, relativePath), "utf8");
      },
    },

    search: {
      pattern(pattern: string, language: "TypeScript" | "JavaScript" = "TypeScript"): Match[] {
        const r = spawnSync("sg", ["run", "-p", pattern, "-l", language, "--json", root], {
          encoding: "utf8",
          timeout: 120000,
        });
        if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error("ctx.search requires ast-grep (sg) on PATH — install: brew install ast-grep");
        }
        if (r.status !== 0 && !r.stdout.trim()) {
          throw new Error("ctx.search failed: " + (r.stderr || "sg exited " + r.status));
        }
        let raw: RawSgMatch[] = [];
        try {
          raw = JSON.parse(r.stdout);
        } catch {
          throw new Error(`ctx.search produced unparseable output from sg — refusing to report a false green. First bytes: ${JSON.stringify(r.stdout.slice(0, 120))}`);
        }
        return raw.map(m => ({
          file: (m.file || "").replace(new RegExp("^" + escapeRegExp(root) + "/"), ""),
          line: (m.range?.start?.line ?? 0) + 1,
          column: m.range?.start?.column ?? 1,
          text: m.text || "",
        }));
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
