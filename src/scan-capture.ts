import * as fs from "fs";
import * as path from "path";
import { resolveFinding, ReportGroup, withinDir } from "./contract.js";
import { DoctorDigest, EvidenceInput, EvidenceReport, extractEvidence, spansProvider } from "./identity.js";

// Scan capture: what a scan actually saw, promoted out of the diff (M2)
// because decisions apply on EVERY run, not only diff runs. The law the
// identity repairs established is unchanged: evidence is captured at
// scan-adjacency from an immutable source map (one read per file with
// findings — the evidence bytes and the retained bytes are the same bytes
// by construction), and doctor digests are taken before the scan they
// describe. The command layer captures immediately after a cohort settles;
// nothing that happens afterward can lend a finding different bytes.

// One finding zipped with the group that emitted it and the checkKey the
// identity layer namespaces by — parallel to the neutral evidence array.
export interface Entry {
  f: import("./contract.js").Finding;
  g: ReportGroup;
  checkKey: string;
}

export function entriesOf(groups: ReportGroup[]): Entry[] {
  const out: Entry[] = [];
  for (const g of groups) {
    for (const f of g.findings) {
      out.push({ f, g, checkKey: resolveFinding(g.meta, f).checkKey });
    }
  }
  return out;
}

export function evidenceInputOf(e: Entry): EvidenceInput {
  return {
    checkKey: e.checkKey,
    file: e.f.file,
    line: e.f.line,
    ...(e.f.column !== undefined ? { column: e.f.column } : {}),
    ...(e.f.evidence !== undefined ? { evidence: e.f.evidence } : {}),
  };
}

// The identity key of an entry — the same string the diff's comparison
// buckets by. A decision stores THIS; applying decisions is matching keys.
export function identityKeyOf(e: Entry, evidence: EvidenceReport["occurrences"][number]): string {
  return [
    e.checkKey,
    e.f.file,
    evidence.lineDigest ?? `stale\u0000${e.f.file}:${e.f.line}`,
    evidence.contextId ?? "\u0000none",
    evidence.relColumn ?? "-",
    evidence.scope,
  ].join("\u0000");
}

// Evidence reads stay inside the scanned root — a finding's file string is
// doctor-supplied data, and the host's read must not become an escape hatch
// the confined doctor itself could never take. withinDir is the strict
// containment form's one home (a scan root is a directory, not a prefix).
export function readFileFrom(root: string): (rel: string) => string | null {
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

// What a scan actually saw: the groups, their entries, the evidence
// extracted from an immutable source capture, and the doctor digests
// taken before the scan (passed in by the command layer, which owns the
// timing).
export interface ScanCapture {
  groups: ReportGroup[];
  entries: Entry[];
  analysisAvailable: boolean;
  digests: DoctorDigest[];
  evidence: EvidenceReport;
  sources: Map<string, string>;
}

export function captureScan(
  targetDir: string,
  groups: ReportGroup[],
  analysisAvailable: boolean,
  digests: DoctorDigest[],
): ScanCapture {
  const entries = entriesOf(groups);
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
  return { groups, entries, analysisAvailable, digests, evidence, sources };
}

// The consistency recheck: if a file changed on disk since its
// scan-adjacent capture, the capture no longer describes the working tree
// this run is reporting on — every occurrence in that file goes stale
// (never a false continuity through borrowed bytes). What this cannot
// catch is an edit DURING a scan itself — a documented residual, never a
// guarantee.
export function invalidateChangedFiles(capture: ScanCapture, targetDir: string): void {
  if (capture.sources.size === 0) return;
  const reader = readFileFrom(targetDir);
  const changed = new Set<string>();
  for (const [file, captured] of capture.sources) {
    if (reader(file) !== captured) changed.add(file);
  }
  if (changed.size === 0) return;
  for (const o of capture.evidence.occurrences) {
    if (changed.has(o.file)) o.lineDigest = null;
  }
}
