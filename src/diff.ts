import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Finding, resolveFinding, ReportGroup, Severity } from "./contract.js";
import { CohortSpec, runCohort } from "./cohort.js";
import { deriveSummary } from "./summary.js";
import { withinDir } from "./contract.js";
import {
  compareOccurrences, comparableScans, digestTextFile, DoctorDigest, doctorDigests,
  extractEvidence, EvidenceInput, EvidenceReport,
  IDENTITY_SCHEMA_VERSION, ScanComparison, ScanProvenance, scanProvenance, spansProvider,
} from "./identity.js";

// Diff mode: the stateless baseline. No file is committed, nothing goes
// stale — "new" means "in HEAD but not at the merge base of --base and
// HEAD" (React Doctor's proven posture). The same cohort runs against a
// materialized base tree, and the two DEDUPED finding sets compare through
// the identity layer (A1/A2): an occurrence is "added" when no compatible
// base occurrence matches its evidence — namespace, file, normalized line
// content, relative column, and enclosing structural context — not merely
// when its coordinates are new. A finding that moved with its code is
// continuing; a base occurrence with no head counterpart is no-longer-
// detected, and that is an observed absence, never a fix claim.
// compareFindings remains the fixture gate's exact multiset: movement
// tolerance lives here, where movement is the question — never in
// certification, where exact locations are the claim.
//
// A partial base never gates: any base-scan crash aborts the run loudly,
// because a base missing findings would dress pre-existing debt up as
// "added" and block merges dishonestly.

export interface DiffFinding {
  doctorId: string;
  rule?: string;
  file: string;
  line: number;
  column?: number;
  severity: Severity;
}

export interface DiffResult {
  // The ref exactly as the user passed it (for prose).
  base: string;
  // The merge base the diff actually ran against.
  baseSha: string;
  // The HEAD commit the working tree sits on, and whether anything in the
  // repo (tracked changes or untracked files, repo-wide — a coarse but
  // honest over-approximation of "the scan saw more than HEAD") differed
  // from it at diff time. The head side scans the working tree, not the
  // commit; these two fields are what attributes its findings later.
  headSha: string;
  headDirty: boolean;
  added: DiffFinding[];
  // Occurrences matched to a base counterpart — the count, not a pairing
  // claim when identical copies were matched by cardinality (ambiguous).
  continuing: number;
  // Base occurrences with no head counterpart: absence under this scan.
  noLongerDetected: DiffFinding[];
  // Continuing matches that rested on content alone (no structural context
  // on at least one side) — the engine-off fallback, kept visible.
  contextFallback: number;
  ambiguous: number;
  // Occurrences with no confident content (unreadable file or a line past
  // end-of-content) — evidence-less, so they can never continue.
  stale: number;
  // Continuing matches that rested on line-scoped evidence (no validated
  // range) — weaker continuity, surfaced for future dismissal reuse.
  lineScoped: number;
  // FILES that could not be read at comparison time, per side summed
  // (their occurrences are already counted in stale).
  unreadable: number;
  // FILES the analysis engine could not parse for context, per side summed.
  contextUnavailable: number;
  identitySchema: number;
  provenance: { head: ScanProvenance; base: ScanProvenance; comparable: boolean };
}

// Raw causes, no flag prefixes: the caller attaches the context and the
// remedy that actually matches (a missing binary wants "install git";
// a not-a-repo exit wants git's own stderr, which already says so).
function git(args: string[], cwd: string): { ok: true; out: string } | { ok: false; cause: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.error) {
    return { ok: false, cause: "git is not on PATH — --base needs it (install git, or diff manually)" };
  }
  if (r.status !== 0) {
    return { ok: false, cause: "git " + args.slice(0, 2).join(" ") + " failed: " + String(r.stderr).trim() };
  }
  return { ok: true, out: String(r.stdout).trim() };
}

// One finding zipped with the group that emitted it and the checkKey the
// identity layer namespaces by — parallel to the neutral evidence array.
interface Entry {
  f: Finding;
  g: ReportGroup;
  checkKey: string;
}

function entriesOf(groups: ReportGroup[]): Entry[] {
  const out: Entry[] = [];
  for (const g of groups) {
    for (const f of g.findings) {
      out.push({ f, g, checkKey: resolveFinding(g.meta, f).checkKey });
    }
  }
  return out;
}

function evidenceInputOf(e: Entry): EvidenceInput {
  return {
    checkKey: e.checkKey,
    file: e.f.file,
    line: e.f.line,
    ...(e.f.column !== undefined ? { column: e.f.column } : {}),
    ...(e.f.evidence !== undefined ? { evidence: e.f.evidence } : {}),
  };
}

// Evidence reads stay inside the scanned root — a finding's file string is
// doctor-supplied data, and the host's read must not become an escape hatch
// the confined doctor itself could never take. withinDir is the strict
// containment form's one home (a scan root is a directory, not a prefix).
function readFileFrom(root: string): (rel: string) => string | null {
  const containmentRoot = path.resolve(root);
  return (rel: string): string | null => {
    const abs = path.resolve(root, rel);
    if (!withinDir(abs, containmentRoot)) return null;
    try {
      return fs.readFileSync(abs, "utf8");
    } catch {
      return null;
    }
  };
}

// The rich projection of chosen entries — severities and doctor ids for the
// gate and the report, joined back through the identity layer's indices.
function joinFindings(entries: Entry[], indices: number[]): DiffFinding[] {
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

// What the HEAD side's scan actually saw, captured at scan-adjacency by
// the command layer: the doctor digests taken BEFORE the head scan, and
// the evidence extracted immediately AFTER it from an immutable source
// capture (one read per file with findings — the evidence bytes and the
// retained bytes are the same bytes by construction). Evidence read
// later, after the base scan and any number of file edits, described
// whatever the disk held at read time, not what the scan saw (review
// finding 2: scan v2, restore v1, compare → false continuity).
export interface HeadScanCapture {
  groups: ReportGroup[];
  analysisAvailable: boolean;
  digests: DoctorDigest[];
  evidence: EvidenceReport;
  sources: Map<string, string>;
}

export function captureHeadScan(
  targetDir: string,
  headGroups: ReportGroup[],
  analysisAvailable: boolean,
  digests: DoctorDigest[],
): HeadScanCapture {
  const entries = entriesOf(headGroups);
  const reader = readFileFrom(targetDir);
  const sources = new Map<string, string>();
  for (const input of entries.map(evidenceInputOf)) {
    if (!sources.has(input.file)) {
      const source = reader(input.file);
      if (source !== null) sources.set(input.file, source);
    }
  }
  const fromCapture = (file: string): string | null => sources.get(file) ?? null;
  const evidence = extractEvidence(entries.map(evidenceInputOf), fromCapture, spansProvider(analysisAvailable));
  return { groups: headGroups, analysisAvailable, digests, evidence, sources };
}

// The HEAD side's consistency recheck: if a file changed on disk since
// its scan-adjacent capture, the capture no longer describes the working
// tree this diff is reporting on — every occurrence in that file goes
// stale (never a false continuity through borrowed bytes). The base side
// needs no recheck: its worktree is materialized once by git and removed
// at the end, so its bytes cannot change under the scan. What this
// cannot catch is an edit DURING a scan itself — a documented residual,
// never a guarantee.
function invalidateChangedHeadFiles(head: HeadScanCapture, targetDir: string): void {
  if (head.sources.size === 0) return;
  const reader = readFileFrom(targetDir);
  const changed = new Set<string>();
  for (const [file, captured] of head.sources) {
    if (reader(file) !== captured) changed.add(file);
  }
  if (changed.size === 0) return;
  for (const o of head.evidence.occurrences) {
    if (changed.has(o.file)) o.lineDigest = null;
  }
}

// The HEAD cohort has already run and its capture has been taken at
// scan-adjacency by the caller; only the base side scans here.
export async function runDiff(
  spec: CohortSpec,
  baseRef: string,
  head: HeadScanCapture,
): Promise<DiffResult> {
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
    // Base-side provenance is captured BEFORE its scan — bracketing the
    // execution it describes, the same law the head capture follows.
    const baseDigests = doctorDigests(spec.doctors, digestTextFile);
    const addR = git(["worktree", "add", "--detach", worktree, baseSha], repoRoot);
    if (!addR.ok) {
      throw new Error("--base failed to materialize the base tree: " + addR.cause);
    }
    // A subpath that doesn't exist at the base is a directory HEAD
    // invented — its base findings are honestly empty, not a failure.
    const baseTarget = path.join(worktree, rel);
    let baseGroups: ReportGroup[] = [];
    let baseAnalysisAvailable = false;
    let baseDigestsPost: DoctorDigest[] = [];
    let baseSources = new Map<string, string>();
    let baseEvidence: EvidenceReport = { occurrences: [], unreadableFiles: [], contextUnavailableFiles: [] };
    if (fs.existsSync(baseTarget)) {
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
      // derivation, so the gate counts what the report shows. Evidence is
      // captured immediately after this scan, from an immutable source
      // map, mirroring the head capture.
      baseGroups = deriveSummary(baseRun).groups;
      baseAnalysisAvailable = baseRun.analysisAvailable ?? false;
      baseDigestsPost = baseDigests;
      const baseReader = readFileFrom(baseTarget);
      const baseScanEntries = entriesOf(baseGroups);
      for (const input of baseScanEntries.map(evidenceInputOf)) {
        if (!baseSources.has(input.file)) {
          const source = baseReader(input.file);
          if (source !== null) baseSources.set(input.file, source);
        }
      }
      const fromBaseCapture = (file: string): string | null => baseSources.get(file) ?? null;
      baseEvidence = extractEvidence(baseScanEntries.map(evidenceInputOf), fromBaseCapture, spansProvider(baseAnalysisAvailable));
    } else {
      baseDigestsPost = baseDigests;
    }

    const headEntries = entriesOf(head.groups);
    const baseEntries = entriesOf(baseGroups);
    const provenance = {
      head: scanProvenance(spec.doctors, head.analysisAvailable, head.digests),
      base: scanProvenance(spec.doctors, baseAnalysisAvailable, baseDigestsPost),
    };
    const comparable = comparableScans(provenance.base, provenance.head);

    // A changed doctor between the two executions refuses continuity
    // outright — every head occurrence added, every base occurrence
    // absent — instead of guessing movement through a changed detector.
    // The pre-scan digests make this verdict trustworthy: each side
    // describes the bytes that were about to run when it ran.
    let cmp: ScanComparison;
    if (comparable) {
      invalidateChangedHeadFiles(head, spec.targetDir);
      cmp = compareOccurrences(baseEvidence.occurrences, head.evidence.occurrences);
    } else {
      cmp = {
        pairs: [],
        addedIndices: headEntries.map((_, i) => i),
        absentIndices: baseEntries.map((_, i) => i),
        ambiguous: 0,
        stale: 0,
        lineScoped: 0,
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
      lineScoped: cmp.lineScoped,
      unreadable: baseEvidence.unreadableFiles.length + head.evidence.unreadableFiles.length,
      contextUnavailable: baseEvidence.contextUnavailableFiles.length + head.evidence.contextUnavailableFiles.length,
      identitySchema: IDENTITY_SCHEMA_VERSION,
      provenance: { ...provenance, comparable },
    };
  } finally {
    git(["worktree", "remove", "--force", worktree], repoRoot);
    fs.rmSync(worktree, { recursive: true, force: true });
  }
}
