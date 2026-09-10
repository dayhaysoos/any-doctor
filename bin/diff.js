import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveFinding } from "./contract.js";
import { runCohort } from "./cohort.js";
import { deriveSummary } from "./summary.js";
import { withinBase } from "./contract.js";
import { compareOccurrences, comparableScans, extractEvidence, IDENTITY_SCHEMA_VERSION, scanProvenance, spansProvider, } from "./identity.js";
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
function entriesOf(groups) {
    const out = [];
    for (const g of groups) {
        for (const f of g.findings) {
            out.push({ f, g, checkKey: resolveFinding(g.meta, f).checkKey });
        }
    }
    return out;
}
function evidenceInputOf(e) {
    return { checkKey: e.checkKey, file: e.f.file, line: e.f.line, ...(e.f.column !== undefined ? { column: e.f.column } : {}) };
}
// Evidence reads stay inside the scanned root — a finding's file string is
// doctor-supplied data, and the host's read must not become an escape hatch
// the confined doctor itself could never take. withinBase is the one home
// of the containment law (the same predicate the search and analysis hosts
// enforce).
function readFileFrom(root) {
    const containmentRoot = path.resolve(root);
    return (rel) => {
        const abs = path.resolve(root, rel);
        if (!withinBase(abs, containmentRoot))
            return null;
        try {
            return fs.readFileSync(abs, "utf8");
        }
        catch {
            return null;
        }
    };
}
function readProgramOrNull(programPath) {
    try {
        return fs.readFileSync(programPath, "utf8");
    }
    catch {
        return null;
    }
}
// The rich projection of chosen entries — severities and doctor ids for the
// gate and the report, joined back through the identity layer's indices.
function joinFindings(entries, indices) {
    return indices.map((i) => {
        const { f, g } = entries[i];
        return {
            doctorId: g.meta.id,
            ...(f.rule !== undefined ? { rule: f.rule } : {}),
            file: f.file,
            line: f.line,
            ...(f.column !== undefined ? { column: f.column } : {}),
            severity: resolveFinding(g.meta, f).severity,
        };
    });
}
// The HEAD cohort has already run by the time diff mode starts — the
// caller passes its (deduped) groups and analysis availability; only the
// base side scans here.
export async function runDiff(spec, baseRef, headGroups, headAnalysisAvailable) {
    var _a, _b, _c, _d, _e;
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
    // Head-side provenance: the commit the working tree sits on, and whether
    // the scan's real input (the working tree) differed from it.
    const headShaR = git(["rev-parse", "HEAD"], repoRoot);
    if (!headShaR.ok) {
        throw new Error("--base failed to read HEAD: " + headShaR.cause);
    }
    const headSha = headShaR.out;
    const statusR = git(["status", "--porcelain"], repoRoot);
    const headDirty = statusR.ok ? statusR.out.length > 0 : true;
    const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-base-"));
    try {
        const addR = git(["worktree", "add", "--detach", worktree, baseSha], repoRoot);
        if (!addR.ok) {
            throw new Error("--base failed to materialize the base tree: " + addR.cause);
        }
        // A subpath that doesn't exist at the base is a directory HEAD
        // invented — its base findings are honestly empty, not a failure.
        const baseTarget = path.join(worktree, rel);
        let baseGroups = [];
        let baseAnalysisAvailable = false;
        if (fs.existsSync(baseTarget)) {
            const baseRun = await runCohort({ ...spec, targetDir: baseTarget });
            if (baseRun.crashed.length > 0) {
                // The loud abort: never gate on a partial base.
                const names = baseRun.crashed.map(c => c.id).join(", ");
                throw new Error(`--base aborted: the base scan crashed (${names}) — a partial baseline would dress pre-existing findings up as added. Details:\n`
                    + baseRun.crashed.map(c => c.detail).join("\n"));
            }
            // Deduped like the HEAD side — both sets read through the one
            // derivation, so the gate counts what the report shows.
            baseGroups = deriveSummary(baseRun).groups;
            baseAnalysisAvailable = (_a = baseRun.analysisAvailable) !== null && _a !== void 0 ? _a : false;
        }
        const headEntries = entriesOf(headGroups);
        const baseEntries = entriesOf(baseGroups);
        const provenance = {
            head: scanProvenance(spec.doctors, headAnalysisAvailable, readProgramOrNull),
            base: scanProvenance(spec.doctors, baseAnalysisAvailable, readProgramOrNull),
        };
        const comparable = comparableScans(provenance.base, provenance.head);
        // A changed doctor between the two sides refuses continuity outright —
        // every head occurrence added, every base occurrence absent — instead
        // of guessing movement through a changed detector. Within one run the
        // same programs execute on both sides, so this is the guard, not the
        // norm.
        let cmp;
        let headEvidence;
        let baseEvidence;
        if (comparable) {
            baseEvidence = extractEvidence(baseEntries.map(evidenceInputOf), readFileFrom(baseTarget), spansProvider(baseAnalysisAvailable));
            headEvidence = extractEvidence(headEntries.map(evidenceInputOf), readFileFrom(spec.targetDir), spansProvider(headAnalysisAvailable));
            cmp = compareOccurrences(baseEvidence.occurrences, headEvidence.occurrences);
        }
        else {
            cmp = {
                pairs: [],
                addedIndices: headEntries.map((_, i) => i),
                absentIndices: baseEntries.map((_, i) => i),
                ambiguous: 0,
                stale: 0,
            };
        }
        return {
            base: baseRef,
            baseSha,
            headSha,
            headDirty,
            added: joinFindings(headEntries, cmp.addedIndices),
            continuing: cmp.pairs.length,
            noLongerDetected: joinFindings(baseEntries, cmp.absentIndices),
            contextFallback: cmp.pairs.filter(p => p.contextFallback).length,
            ambiguous: cmp.ambiguous,
            stale: cmp.stale,
            unreadable: ((_b = baseEvidence === null || baseEvidence === void 0 ? void 0 : baseEvidence.unreadableFiles.length) !== null && _b !== void 0 ? _b : 0) + ((_c = headEvidence === null || headEvidence === void 0 ? void 0 : headEvidence.unreadableFiles.length) !== null && _c !== void 0 ? _c : 0),
            contextUnavailable: ((_d = baseEvidence === null || baseEvidence === void 0 ? void 0 : baseEvidence.contextUnavailableFiles.length) !== null && _d !== void 0 ? _d : 0) + ((_e = headEvidence === null || headEvidence === void 0 ? void 0 : headEvidence.contextUnavailableFiles.length) !== null && _e !== void 0 ? _e : 0),
            identitySchema: IDENTITY_SCHEMA_VERSION,
            provenance: { ...provenance, comparable },
        };
    }
    finally {
        git(["worktree", "remove", "--force", worktree], repoRoot);
        fs.rmSync(worktree, { recursive: true, force: true });
    }
}
