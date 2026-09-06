import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DOCTOR_FILE_RE, FIXTURES_FILE_RE } from "./contract.js";
import { metaDoctor } from "./runner.js";
export function globalDoctorsDir() {
    return path.join(os.homedir(), ".any-doctor", "doctors");
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
    var _a;
    const repoDir = findRepoDoctorsDir(cwd);
    const scopes = [
        ...(repoDir ? [{ scope: "repo", dir: repoDir }] : []),
        { scope: "global", dir: (_a = opts === null || opts === void 0 ? void 0 : opts.globalDir) !== null && _a !== void 0 ? _a : globalDoctorsDir() },
    ];
    const bySlug = new Map();
    for (const { scope, dir } of scopes) {
        if (!fs.existsSync(dir))
            continue;
        const files = fs.readdirSync(dir)
            .filter(f => (f.endsWith(".mjs") || f.endsWith(".js")) && !FIXTURES_FILE_RE.test(f))
            .sort();
        for (const f of files) {
            const slug = f.replace(DOCTOR_FILE_RE, "");
            if (bySlug.has(slug))
                continue;
            const abs = path.join(dir, f);
            const { meta, error } = await metaDoctor({ programPath: abs });
            bySlug.set(slug, { slug, scope, path: abs, meta, error });
        }
    }
    return [...bySlug.values()];
}
// Explicit paths (absolute, or containing separators) resolve directly.
// Bare filenames are slugs: scopes win - repo-local first - so a stray
// slug.mjs in the working directory cannot shadow an installed doctor.
export function resolveDoctorPath(arg, cwd, opts) {
    var _a;
    const bare = path.basename(arg) === arg && !path.isAbsolute(arg);
    if (!bare) {
        const direct = path.resolve(cwd, arg);
        if (fs.existsSync(direct))
            return direct;
    }
    if (bare) {
        const base = path.basename(arg);
        const repoDir = findRepoDoctorsDir(cwd);
        const scopes = [repoDir, (_a = opts === null || opts === void 0 ? void 0 : opts.globalDir) !== null && _a !== void 0 ? _a : globalDoctorsDir()].filter((d) => Boolean(d));
        for (const dir of scopes) {
            const candidate = path.join(dir, base);
            if (fs.existsSync(candidate))
                return candidate;
        }
        const direct = path.resolve(cwd, arg);
        if (fs.existsSync(direct))
            return direct;
    }
    return null;
}
