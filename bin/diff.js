import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { compareFindings, resolveFinding } from "./contract.js";
import { runCohort } from "./cohort.js";
import { deriveSummary } from "./summary.js";
// Raw causes, no flag prefixes: the caller attaches the context and the
// remedy that actually matches (a missing binary wants "install git";
// a not-a-repo exit wants git's own stderr, which already says so).
function git(args, cwd) {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (r.error) {
        return { ok: false, cause: "git is not on PATH — --base needs it (install git, or diff manually)" };
    }
    if (r.status !== 0) {
        return { ok: false, cause: "git " + args.slice(0, 2).join(" ") + " failed: " + String(r.stderr).trim() };
    }
    return { ok: true, out: String(r.stdout).trim() };
}
function findingKey(rule, file, line, column) {
    return `${rule !== null && rule !== void 0 ? rule : ""}:${file}:${line}:${column !== null && column !== void 0 ? column : ""}`;
}
// Join each unexpected diff entry back to the rich HEAD finding it
// corresponds to (same key, in scan order) — the multiset diff counts
// keys; the report and the gate need severities and doctor ids.
function joinAdded(unexpected, headGroups) {
    var _a, _b;
    const byKey = new Map();
    for (const g of headGroups) {
        for (const f of g.findings) {
            const q = (_a = byKey.get(findingKey(f.rule, f.file, f.line, f.column))) !== null && _a !== void 0 ? _a : [];
            q.push({ f, g });
            byKey.set(findingKey(f.rule, f.file, f.line, f.column), q);
        }
    }
    const out = [];
    for (const u of unexpected) {
        const pair = (_b = byKey.get(findingKey(u.rule, u.file, u.line, u.column))) === null || _b === void 0 ? void 0 : _b.shift();
        if (pair === undefined)
            continue; // unreachable: the entry came from those findings
        out.push({
            doctorId: pair.g.meta.id,
            ...(pair.f.rule !== undefined ? { rule: pair.f.rule } : {}),
            ...(pair.f.column !== undefined ? { column: pair.f.column } : {}),
            file: pair.f.file,
            line: pair.f.line,
            severity: resolveFinding(pair.g.meta, pair.f).severity,
        });
    }
    return out;
}
// The HEAD cohort has already run by the time diff mode starts — the
// caller passes its (deduped) groups; only the base side scans here.
export async function runDiff(spec, baseRef, headGroups) {
    const repoRootR = git(["rev-parse", "--show-toplevel"], spec.targetDir);
    if (!repoRootR.ok) {
        throw new Error("--base failed: " + repoRootR.cause);
    }
    const repoRoot = repoRootR.out;
    // git reports the realpath (/private/var on macOS) while callers may
    // hold the symlinked spelling (/var) — realpath the target or every
    // temp-dir target would look "outside" the repo.
    const rel = path.relative(repoRoot, fs.realpathSync(spec.targetDir));
    if (rel.startsWith("..")) {
        throw new Error(`--base needs the target inside the git repository (target ${spec.targetDir}, repo ${repoRoot})`);
    }
    const baseShaR = git(["merge-base", baseRef, "HEAD"], repoRoot);
    if (!baseShaR.ok) {
        throw new Error(`--base failed to resolve "${baseRef}": ` + baseShaR.cause);
    }
    const baseSha = baseShaR.out;
    const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-base-"));
    try {
        const addR = git(["worktree", "add", "--detach", worktree, baseSha], repoRoot);
        if (!addR.ok) {
            throw new Error("--base failed to materialize the base tree: " + addR.cause);
        }
        // A subpath that doesn't exist at the base is a directory HEAD
        // invented — its base findings are honestly empty, not a failure.
        const baseTarget = path.join(worktree, rel);
        let baseFindings;
        if (!fs.existsSync(baseTarget)) {
            baseFindings = [];
        }
        else {
            const baseRun = await runCohort({ ...spec, targetDir: baseTarget });
            if (baseRun.crashed.length > 0) {
                // The loud abort: never gate on a partial base.
                const names = baseRun.crashed.map(c => c.id).join(", ");
                throw new Error(`--base aborted: the base scan crashed (${names}) — a partial baseline would dress pre-existing findings up as added. Details:\n`
                    + baseRun.crashed.map(c => c.detail).join("\n"));
            }
            // Deduped like the HEAD side — both sets read through the one
            // derivation, so the gate counts what the report shows.
            baseFindings = deriveSummary(baseRun).groups.flatMap(g => g.findings);
        }
        const diff = compareFindings(baseFindings, headGroups.flatMap(g => g.findings));
        return {
            base: baseRef,
            baseSha,
            added: joinAdded(diff.unexpected, headGroups),
            resolved: diff.missing,
        };
    }
    finally {
        git(["worktree", "remove", "--force", worktree], repoRoot);
        fs.rmSync(worktree, { recursive: true, force: true });
    }
}
