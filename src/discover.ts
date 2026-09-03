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

export function findRepoDoctorsDir(cwd: string): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(dir, "doctors");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
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
  const repoDir = findRepoDoctorsDir(cwd);
  const scopes: { scope: Scope; dir: string }[] = [
    ...(repoDir ? [{ scope: "repo" as Scope, dir: repoDir }] : []),
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

export function resolveDoctorPath(arg: string, cwd: string): string | null {
  const direct = path.resolve(cwd, arg);
  if (fs.existsSync(direct)) return direct;
  const base = path.basename(arg);
  const repoDir = findRepoDoctorsDir(cwd);
  const scopes = [repoDir, opts_globalDir()].filter((d): d is string => Boolean(d));
  for (const dir of scopes) {
    const candidate = path.join(dir, base);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function opts_globalDir(): string {
  return globalDoctorsDir();
}
