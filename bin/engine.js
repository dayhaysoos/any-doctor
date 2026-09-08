import { spawnSync } from "child_process";
// ast-grep renamed its binary; old installs only have `sg`. Try the new
// name first (no deprecation warning on stderr), fall back once.
function invoke(args, root) {
    let r = spawnSync("ast-grep", [...args, root], { encoding: "utf8", timeout: 120000 });
    if (r.error && r.error.code === "ENOENT") {
        r = spawnSync("sg", [...args, root], { encoding: "utf8", timeout: 120000 });
    }
    return r;
}
function missingEngine(r) {
    return Boolean(r.error && r.error.code === "ENOENT");
}
// Rule queries need `scan --inline-rules`, which older ast-greps lack.
// A clap complaint about the flag or the subcommand is an age problem,
// not a rule problem — say so instead of forwarding CLI noise.
function tooOld(stderr) {
    return /--inline-rules|unrecognized subcommand|unexpected argument/.test(stderr);
}
export function runEngine(query, language, root) {
    const args = query.op === "pattern"
        ? ["run", "-p", query.pattern, "-l", language, "--json"]
        : ["scan", "--inline-rules", JSON.stringify({ language, rule: toSgRule(query.rule) }), "--json"];
    const r = invoke(args, root);
    if (missingEngine(r)) {
        return { ok: false, error: "ctx.search requires ast-grep (ast-grep or sg) on PATH — install: brew install ast-grep" };
    }
    if (r.status !== 0 && !String(r.stdout).trim()) {
        if (query.op === "rule" && tooOld(String(r.stderr))) {
            return { ok: false, error: "ctx.search.rule requires a newer ast-grep (no scan --inline-rules support) — upgrade: brew upgrade ast-grep" };
        }
        return { ok: false, error: "ctx.search failed: " + (r.stderr || "ast-grep exited " + r.status) };
    }
    try {
        return { ok: true, matches: JSON.parse(String(r.stdout)) };
    }
    catch {
        return {
            ok: false,
            error: `ctx.search produced unparseable output from ast-grep — refusing to report a false green. First bytes: ${JSON.stringify(String(r.stdout).slice(0, 120))}`,
        };
    }
}
// The curated subset, translated to ast-grep's rule dialect. stopBy
// defaults to "end" HERE — one home for the divergence from ast-grep's
// own neighbor default, so every consumer gets it without remembering.
function toSgRule(query) {
    var _a;
    const rule = { pattern: query.pattern };
    if (query.inside) {
        rule.inside = { pattern: query.inside.pattern, stopBy: (_a = query.inside.stopBy) !== null && _a !== void 0 ? _a : "end" };
    }
    return rule;
}
