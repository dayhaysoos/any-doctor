import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { DOCTOR_FILE_RE, FIXTURES_FILE_RE } from "./contract.js";
import { metaDoctor } from "./runner.js";
// Bundled is the ambient default — every row saying "bundled" carries no
// signal exactly when discovery is all-bundled. Scope labels mark the
// deviations: a repo doctor is yours to edit, a global one is installed.
export function scopeLabel(scope) {
    return scope === "bundled" ? "" : scope;
}
// The gate's partition over discovery — owned by the data so every surface
// (run cohorts, verify, the picker) splits identically. Only null-meta
// doctors belong to either bucket; a healthy doctor is neither skipped nor
// named.
export function unsafeSlugs(discovered) {
    return discovered.filter(d => { var _a; return d.meta === null && ((_a = d.cause) === null || _a === void 0 ? void 0 : _a._tag) === "DoctorUnsafe"; }).map(d => d.slug);
}
export function brokenDoctors(discovered) {
    return discovered
        .filter(d => { var _a; return d.meta === null && ((_a = d.cause) === null || _a === void 0 ? void 0 : _a._tag) !== "DoctorUnsafe"; })
        .map(d => ({ slug: d.slug, cause: d.cause }));
}
export function globalDoctorsDir() {
    return path.join(os.homedir(), ".any-doctor", "doctors");
}
// The bundled pack: the package's own doctors/, a sibling of bin/ wherever
// the package lives (repo dev, node_modules, or the npx cache). Read-only
// and lowest priority (D15) — repo-local and user-global win collisions.
export function bundledDoctorsDir() {
    return path.join(path.resolve(fileURLToPath(new URL("..", import.meta.url))), "doctors");
}
export function findRepoDoctorsDir(cwd) {
    let dir = path.resolve(cwd);
    for (;;) {
        const candidate = path.join(dir, "doctors");
        if (fs.existsSync(candidate))
            return candidate;
        const parent = path.dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
}
export async function discoverDoctors(cwd, opts) {
    var _a, _b;
    const repoDir = findRepoDoctorsDir(cwd);
    const scopes = [
        ...(repoDir ? [{ scope: "repo", dir: repoDir }] : []),
        { scope: "global", dir: (_a = opts === null || opts === void 0 ? void 0 : opts.globalDir) !== null && _a !== void 0 ? _a : globalDoctorsDir() },
        { scope: "bundled", dir: (_b = opts === null || opts === void 0 ? void 0 : opts.bundledDir) !== null && _b !== void 0 ? _b : bundledDoctorsDir() },
    ];
    const bySlug = new Map();
    const seenDirs = [];
    for (const { scope, dir } of scopes) {
        // Running inside this repo, the bundled dir IS the repo dir — scan it
        // once, as the repo scope.
        const resolved = path.resolve(dir);
        if (seenDirs.includes(resolved))
            continue;
        seenDirs.push(resolved);
        if (!fs.existsSync(dir))
            continue;
        const files = fs.readdirSync(dir)
            .filter(f => (f.endsWith(".mjs") || f.endsWith(".js")) && !FIXTURES_FILE_RE.test(f))
            .sort();
        // Discovery fans out: every command pays this latency, metaDoctor never
        // throws, and doctor counts grow once bundled doctors ship.
        const reads = await Promise.all(files.map(async (f) => ({
            slug: f.replace(DOCTOR_FILE_RE, ""),
            abs: path.join(dir, f),
            read: await metaDoctor({ programPath: path.join(dir, f) }),
        })));
        for (const { slug, abs, read } of reads) {
            if (bySlug.has(slug))
                continue;
            bySlug.set(slug, { slug, scope, path: abs, meta: read.meta, cause: read.cause });
        }
    }
    return [...bySlug.values()];
}
// Explicit paths (absolute, or containing separators) resolve directly.
// Bare filenames are slugs: scopes win — repo-local first, then global,
// then bundled — so a stray slug.mjs in the working directory cannot
// shadow an installed doctor.
export function resolveDoctorPath(arg, cwd, opts) {
    var _a, _b;
    const bare = path.basename(arg) === arg && !path.isAbsolute(arg);
    if (!bare) {
        const direct = path.resolve(cwd, arg);
        if (fs.existsSync(direct))
            return direct;
    }
    if (bare) {
        const base = path.basename(arg);
        const repoDir = findRepoDoctorsDir(cwd);
        const scopes = [
            repoDir,
            (_a = opts === null || opts === void 0 ? void 0 : opts.globalDir) !== null && _a !== void 0 ? _a : globalDoctorsDir(),
            (_b = opts === null || opts === void 0 ? void 0 : opts.bundledDir) !== null && _b !== void 0 ? _b : bundledDoctorsDir(),
        ].filter((d) => Boolean(d));
        // A bare slug names the doctor, not the file: try it verbatim (for
        // callers who typed the extension) and then the doctor extensions,
        // canonical .mjs first.
        for (const dir of scopes) {
            for (const suffix of ["", ".mjs", ".cjs", ".js"]) {
                const candidate = path.join(dir, base + suffix);
                if (fs.existsSync(candidate))
                    return candidate;
            }
        }
        const direct = path.resolve(cwd, arg);
        if (fs.existsSync(direct))
            return direct;
    }
    return null;
}
