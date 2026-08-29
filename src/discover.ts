import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DoctorMeta, RESULT_SENTINEL } from "./contract";

export type Scope = "repo" | "global";

export interface DiscoveredDoctor {
  slug: string;
  scope: Scope;
  path: string;
  meta: DoctorMeta | null;
  error?: string;
}

export function globalDoctorsDir(): string {
  return path.join(os.homedir(), ".any-doctor", "doctors");
}

function loaderPath(): string {
  return path.join(__dirname, "doctor-loader.mjs");
}

export function readMeta(doctorPath: string): { meta: DoctorMeta | null; error?: string } {
  const r = spawnSync(process.execPath, [loaderPath(), doctorPath, "--meta"], {
    encoding: "utf8",
    timeout: 30000,
  });
  const idx = r.stdout.split("\n").findLastIndex(l => l.startsWith(RESULT_SENTINEL));
  if (r.status !== 0 || idx === -1) {
    const detail = (r.stderr || r.stdout || "loader exited " + r.status).trim().split("\n").slice(-2).join(" | ");
    return { meta: null, error: detail };
  }
  const parsed = JSON.parse(r.stdout.split("\n")[idx].slice(RESULT_SENTINEL.length));
  return { meta: parsed.meta };
}

export function discoverDoctors(cwd: string, opts?: { globalDir?: string }): DiscoveredDoctor[] {
  const scopes: { scope: Scope; dir: string }[] = [
    { scope: "repo", dir: path.join(cwd, "doctors") },
    { scope: "global", dir: opts?.globalDir ?? globalDoctorsDir() },
  ];
  const bySlug = new Map<string, DiscoveredDoctor>();
  for (const { scope, dir } of scopes) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir)
      .filter(f => (f.endsWith(".mjs") || f.endsWith(".js")) && !/\.fixtures\.(m|c)?js$/.test(f))
      .sort();
    for (const f of files) {
      const slug = f.replace(/\.(m|c)?js$/, "");
      if (bySlug.has(slug)) continue;
      const abs = path.join(dir, f);
      const { meta, error } = readMeta(abs);
      bySlug.set(slug, { slug, scope, path: abs, meta, error });
    }
  }
  return [...bySlug.values()];
}
