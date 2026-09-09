import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { compareFindings, ExpectedFinding, Finding, resolveFinding, ReportGroup, Severity } from "./contract.js";
import { CohortSpec, runCohort } from "./cohort.js";
import { deriveSummary } from "./summary.js";

// Diff mode: the stateless baseline. No file is committed, nothing goes
// stale — "new" means "in HEAD but not at the merge base of --base and
// HEAD" (React Doctor's proven posture). The same cohort runs against a
// materialized base tree, and the two DEDUPED finding sets compare
// through the verify gate's own multiset (compareFindings — rule-aware,
// duplicates counted), so what the gate counts and what the report
// shows are the same story.
//
// A partial base never gates: any base-scan crash aborts the run
// loudly, because a base missing findings would dress pre-existing
// debt up as "added" and block merges dishonestly.

export interface AddedFinding {
  doctorId: string;
  rule?: string;
  file: string;
  line: number;
  severity: Severity;
}

export interface DiffResult {
  // The ref exactly as the user passed it (for prose).
  base: string;
  // The merge base the diff actually ran against.
  baseSha: string;
  added: AddedFinding[];
  resolved: ExpectedFinding[];
}

function git(args: string[], cwd: string): { ok: true; out: string } | { ok: false; error: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.error) {
    return { ok: false, error: "--base requires git on PATH (install git, or diff manually)" };
  }
  if (r.status !== 0) {
    return { ok: false, error: "git " + args.join(" ") + " failed: " + String(r.stderr).trim() };
  }
  return { ok: true, out: String(r.stdout).trim() };
}

function findingKey(rule: string | undefined, file: string, line: number): string {
  return `${rule ?? ""}:${file}:${line}`;
}

// Join each unexpected diff entry back to the rich HEAD finding it
// corresponds to (same key, in scan order) — the multiset diff counts
// keys; the report and the gate need severities and doctor ids.
function joinAdded(unexpected: ExpectedFinding[], headGroups: ReportGroup[]): AddedFinding[] {
  const byKey = new Map<string, { f: Finding; g: ReportGroup }[]>();
  for (const g of headGroups) {
    for (const f of g.findings) {
      const q = byKey.get(findingKey(f.rule, f.file, f.line)) ?? [];
      q.push({ f, g });
      byKey.set(findingKey(f.rule, f.file, f.line), q);
    }
  }
  const out: AddedFinding[] = [];
  for (const u of unexpected) {
    const pair = byKey.get(findingKey(u.rule, u.file, u.line))?.shift();
    if (pair === undefined) continue; // unreachable: the entry came from those findings
    out.push({
      doctorId: pair.g.meta.id,
      ...(pair.f.rule !== undefined ? { rule: pair.f.rule } : {}),
      file: pair.f.file,
      line: pair.f.line,
      severity: resolveFinding(pair.g.meta, pair.f).severity,
    });
  }
  return out;
}

// The HEAD cohort has already run by the time diff mode starts — the
// caller passes its (deduped) groups; only the base side scans here.
export async function runDiff(spec: CohortSpec, baseRef: string, headGroups: ReportGroup[]): Promise<DiffResult> {
  const repoRootR = git(["rev-parse", "--show-toplevel"], spec.targetDir);
  if (!repoRootR.ok) {
    throw new Error("--base failed: " + repoRootR.error + " — the target must live inside a git repository");
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
    throw new Error("--base failed to resolve: " + baseShaR.error);
  }
  const baseSha = baseShaR.out;

  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-base-"));
  try {
    const addR = git(["worktree", "add", "--detach", worktree, baseSha], repoRoot);
    if (!addR.ok) {
      throw new Error("--base failed to materialize the base tree: " + addR.error);
    }
    // A subpath that doesn't exist at the base is a directory HEAD
    // invented — its base findings are honestly empty, not a failure.
    const baseTarget = path.join(worktree, rel);
    let baseFindings: Finding[];
    if (!fs.existsSync(baseTarget)) {
      baseFindings = [];
    } else {
      const baseRun = await runCohort({ ...spec, targetDir: baseTarget });
      if (baseRun.crashed.length > 0) {
        // The loud abort: never gate on a partial base.
        const names = baseRun.crashed.map(c => c.id).join(", ");
        throw new Error(
          `--base aborted: the base scan crashed (${names}) — a partial baseline would dress pre-existing findings up as added. Details:\n`
          + baseRun.crashed.map(c => c.detail).join("\n"),
        );
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
  } finally {
    git(["worktree", "remove", "--force", worktree], repoRoot);
    fs.rmSync(worktree, { recursive: true, force: true });
  }
}
