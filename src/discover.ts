import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DOCTOR_FILE_RE, DoctorMeta, FIXTURES_FILE_RE } from "./contract.js";
import { metaDoctor, RunnerError } from "./runner.js";

export type Scope = "repo" | "global";

export interface DiscoveredDoctor {
  slug: string;
  scope: Scope;
  path: string;
  meta: DoctorMeta | null;
  // Typed cause of a null meta — render through describeRunnerError.
  cause?: RunnerError;
}

export interface BrokenDoctor {
  slug: string;
  cause?: RunnerError;
}

// The gate's partition over discovery — owned by the data so every surface
// (run cohorts, verify, the picker) splits identically. Only null-meta
// doctors belong to either bucket; a healthy doctor is neither skipped nor
// named.
export function unsafeSlugs(discovered: DiscoveredDoctor[]): string[] {
  return discovered.filter(d => d.meta === null && d.cause?._tag === "DoctorUnsafe").map(d => d.slug);
}

export function brokenDoctors(discovered: DiscoveredDoctor[]): BrokenDoctor[] {
  return discovered
    .filter(d => d.meta === null && d.cause?._tag !== "DoctorUnsafe")
    .map(d => ({ slug: d.slug, cause: d.cause }));
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

export async function discoverDoctors(cwd: string, opts?: { globalDir?: string }): Promise<DiscoveredDoctor[]> {
  const repoDir = findRepoDoctorsDir(cwd);
  const scopes: { scope: Scope; dir: string }[] = [
    ...(repoDir ? [{ scope: "repo" as Scope, dir: repoDir }] : []),
    { scope: "global", dir: opts?.globalDir ?? globalDoctorsDir() },
  ];
  const bySlug = new Map<string, DiscoveredDoctor>();
  for (const { scope, dir } of scopes) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir)
      .filter(f => (f.endsWith(".mjs") || f.endsWith(".js")) && !FIXTURES_FILE_RE.test(f))
      .sort();
    // Discovery fans out: every command pays this latency, metaDoctor never
    // throws, and doctor counts grow once bundled doctors ship.
    const reads = await Promise.all(files.map(async f => ({
      slug: f.replace(DOCTOR_FILE_RE, ""),
      abs: path.join(dir, f),
      read: await metaDoctor({ programPath: path.join(dir, f) }),
    })));
    for (const { slug, abs, read } of reads) {
      if (bySlug.has(slug)) continue;
      bySlug.set(slug, { slug, scope, path: abs, meta: read.meta, cause: read.cause });
    }
  }
  return [...bySlug.values()];
}

// Explicit paths (absolute, or containing separators) resolve directly.
// Bare filenames are slugs: scopes win - repo-local first - so a stray
// slug.mjs in the working directory cannot shadow an installed doctor.
export function resolveDoctorPath(arg: string, cwd: string, opts?: { globalDir?: string }): string | null {
  const bare = path.basename(arg) === arg && !path.isAbsolute(arg);
  if (!bare) {
    const direct = path.resolve(cwd, arg);
    if (fs.existsSync(direct)) return direct;
  }
  if (bare) {
    const base = path.basename(arg);
    const repoDir = findRepoDoctorsDir(cwd);
    const scopes = [repoDir, opts?.globalDir ?? globalDoctorsDir()].filter((d): d is string => Boolean(d));
    for (const dir of scopes) {
      const candidate = path.join(dir, base);
      if (fs.existsSync(candidate)) return candidate;
    }
    const direct = path.resolve(cwd, arg);
    if (fs.existsSync(direct)) return direct;
  }
  return null;
}
