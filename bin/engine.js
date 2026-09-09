import { spawnSync } from "child_process";
// One batched query over a real repo emits tens of megabytes of JSON (the
// async-doctor pilot's ten patterns produce 24MB over a 979-file repo) —
// spawnSync's 1MB default truncates that mid-array, and the crash reads as
// an ast-grep bug instead of a buffer bug. The ceiling exists so a runaway
// pattern (matching near-every node of a monorepo) fails loudly here
// instead of buffering without end.
const MAX_BUFFER_BYTES = 256 * 1024 * 1024;
// ast-grep renamed its binary; old installs only have `sg`. Try the new
// name first (no deprecation warning on stderr), fall back once. The
// spawn options are one const so the fallback cannot drift from the
// first try.
const SPAWN_OPTS = { encoding: "utf8", timeout: 120000, maxBuffer: MAX_BUFFER_BYTES };
function invoke(args, root) {
    let r = spawnSync("ast-grep", [...args, root], SPAWN_OPTS);
    if (r.error && r.error.code === "ENOENT") {
        r = spawnSync("sg", [...args, root], SPAWN_OPTS);
    }
    return r;
}
function missingEngine(r) {
    return Boolean(r.error && r.error.code === "ENOENT");
}
// spawnSync reports an exceeded maxBuffer as ENOBUFS (verified Node 14–26;
// ERR_CHILD_PROCESS_STDIO_MAXBUFFER is the streams-side name and is kept
// for belt and braces). The distinction matters: without this check the
// truncated stdout falls through to JSON.parse and surfaces as a
// misleading "unparseable output" complaint.
export function isBufferOverflow(r) {
    var _a;
    const code = (_a = r.error) === null || _a === void 0 ? void 0 : _a.code;
    return code === "ENOBUFS" || code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
}
// Rule queries need `scan --inline-rules`, which older ast-greps lack.
// A clap complaint about the flag or the subcommand is an age problem,
// not a rule problem — say so instead of forwarding CLI noise.
function tooOld(stderr) {
    return /--inline-rules|unrecognized subcommand|unexpected argument/.test(stderr);
}
export function runEngine(query, language, root) {
    let args;
    if (query.op === "pattern") {
        args = ["run", "-p", query.pattern, "-l", language, "--json"];
    }
    else if (query.op === "rule") {
        args = ["scan", "--inline-rules", JSON.stringify({ language, rule: toSgRule(query.rule) }), "--json"];
    }
    else {
        // ast-grep accepts multiple inline rules separated by a `---` line;
        // each match comes back tagged with its rule's id.
        args = [
            "scan",
            "--inline-rules",
            query.rules.map((r) => JSON.stringify({ id: r.id, language, rule: toSgRule(r) })).join("\n---\n"),
            "--json",
        ];
    }
    const r = invoke(args, root);
    if (missingEngine(r)) {
        return { ok: false, error: "ctx.search requires ast-grep (ast-grep or sg) on PATH — install: brew install ast-grep" };
    }
    if (isBufferOverflow(r)) {
        return {
            ok: false,
            error: `ctx.search outgrew the engine's ${MAX_BUFFER_BYTES / (1024 * 1024)}MB output buffer — the query matches too much code for one batch; narrow the patterns or split the batch`,
        };
    }
    if (r.status !== 0 && !String(r.stdout).trim()) {
        if (query.op !== "pattern" && tooOld(String(r.stderr))) {
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
