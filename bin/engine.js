import { spawnSync } from "child_process";
export function runEngineSearch(pattern, language, root) {
    const r = spawnSync("sg", ["run", "-p", pattern, "-l", language, "--json", root], {
        encoding: "utf8",
        timeout: 120000,
    });
    if (r.error && r.error.code === "ENOENT") {
        return { ok: false, error: "ctx.search requires ast-grep (sg) on PATH — install: brew install ast-grep" };
    }
    if (r.status !== 0 && !r.stdout.trim()) {
        return { ok: false, error: "ctx.search failed: " + (r.stderr || "sg exited " + r.status) };
    }
    try {
        return { ok: true, matches: JSON.parse(r.stdout) };
    }
    catch {
        return {
            ok: false,
            error: `ctx.search produced unparseable output from sg — refusing to report a false green. First bytes: ${JSON.stringify(r.stdout.slice(0, 120))}`,
        };
    }
}
