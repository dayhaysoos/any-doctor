import { DecisionRecord, Disposition, applyDecisions, OccurrenceKeys } from "./finding-state.js";
import { readKeyFor } from "./contract.js";
import type { ScanCapture } from "./scan-capture.js";
import { identityKeyOf } from "./scan-capture.js";

// The ReviewView: the ONE derivation from a scan capture plus remembered
// decisions to everything any surface renders about them — the Summary's
// law ("one derivation, N adapters") applied to review state. Before this
// module, the command layer fanned one capture into five parallel shapes
// (keyByReadKey, annotations, suppressedReadKeys, ambiguousReadKeys,
// per-surface re-shapings), the dashboard re-implemented applyDecisions'
// laws to maintain its own copy, and JSON de-duplicated annotations back
// into applied — three places that had to agree with one rescan.
//
// The view is immutable; recording and reversing return the next view,
// re-derived from the updated decision list (decisions are small, the
// capture is shared). M3's project scope adds a second record source and
// CI application — those land here, once, instead of multiplying across
// five shapes.

export interface ReviewRow {
  // The argv-safe encoding of the identity key (raw keys hold NULs).
  // ABSENT when the finding's evidence is stale (unreadable source or a
  // line past end-of-content): a location-derived key would REPEAT
  // across runs and let a decision suppress on coordinates alone —
  // missing evidence must request reassessment, never authorize hiding
  // (review probe).
  key?: string;
  decision?: { disposition: Disposition; reason: string; actor: string; updatedAt: string };
  // The decision was held back: identical occurrences share this
  // identity, and one decision must not suppress every copy.
  ambiguous?: number;
  // This finding's evidence could not be read; it is not decidable.
  stale?: boolean;
}

export interface ReviewView {
  // readKey -> that row's review data. Present for every scanned finding
  // (agents get keys from run one); decision only where one applies.
  rows: Map<string, ReviewRow>;
  // readKeys suppressed this run (the active list excludes them).
  // COARSE: readKey omits columns — same-line findings share it — so
  // suppression FILTERS use suppressedIdentityKeys, never this set.
  suppressedReadKeys: Set<string>;
  // Identity keys suppressed this run — column-precise; the only safe
  // key to filter findings by (one decision, one occurrence: the
  // review-probe bug where two same-line findings both vanished).
  suppressedIdentityKeys: Set<string>;
  // readKey -> identity key, raw form (recording decisions attaches to
  // identity; never printed — rows.key is the printable form).
  rawKeyByReadKey: Map<string, string>;
  // Notices, composed once: counts, reassessment and ambiguity warnings.
  accepted: number;
  notApplicable: number;
  reassessing: { checkKey: string; file: string; reason: string }[];
  ambiguous: { checkKey: string; file: string; occurrences: number; reason: string }[];
  dormant: number;
  decisions: DecisionRecord[];
  // The scan's doctor provenance (revisions/digests) — carried so view
  // swaps re-derive under the same rules.
  provenance: ScanProvenance;
}

// The scan's doctor provenance (per-check authored revision when
// declared, else whole-program digest), keyed by checkKey.
export interface ScanProvenance {
  revisions: Map<string, number>;
  programDigests: Map<string, string>;
}

export const emptyProvenance = (): ScanProvenance => ({ revisions: new Map(), programDigests: new Map() });

// Compatible when the revision is declared and unchanged, OR no revision
// is involved anywhere and the program digest is unchanged. Unknown
// (missing provenance on either side) is INCOMPATIBLE — reassessment,
// never silent reuse.
export function provenanceCompatible(recorded: { revision?: number; programDigest?: string } | undefined, scan: ScanProvenance, checkKey: string): boolean {
  if (recorded === undefined) return false;
  // A matching authored revision is compatible regardless of digest
  // churn (the point of revisions); a byte-identical program is
  // compatible regardless of declarations. --key decisions record only
  // the digest, so a revision-declaring check must accept its own
  // unchanged program (review probe: revision:1 rejected its own
  // freshly-recorded decision).
  const scanRevision = scan.revisions.get(checkKey);
  if (recorded.revision !== undefined && scanRevision !== undefined && recorded.revision === scanRevision) return true;
  const doctorId = checkKey.split("/")[0];
  const scanDigest = scan.programDigests.get(doctorId);
  return recorded.programDigest !== undefined && scanDigest !== undefined && recorded.programDigest === scanDigest;
}

export function reviewOf(capture: ScanCapture, decisions: DecisionRecord[], encodeKey: (raw: string) => string, provenance: ScanProvenance = emptyProvenance()): ReviewView {
  const keys: OccurrenceKeys["keys"] = capture.entries.map((e, i) => ({
    key: identityKeyOf(e, capture.evidence.occurrences[i]),
    checkKey: e.checkKey,
    file: e.f.file,
    line: e.f.line,
  }));
  const occ: OccurrenceKeys = {
    keys,
    presentPairs: new Set(keys.map((k) => `${k.checkKey}\u0000${k.file}`)),
  };
  // Changed detector meaning resurfaces decisions: strip incompatible
  // records from the exact-match set and surface each as reassessment
  // (vision: "changed rules must not silently preserve an invalid
  // dismissal" — the review probe that changed a doctor's severity).
  const compatibleDecisions = decisions.filter((d) => provenanceCompatible(d.provenance, provenance, d.checkKey));
  const incompatible = decisions.filter((d) => !compatibleDecisions.includes(d));
  const applied = applyDecisions(compatibleDecisions, occ);
  const occurrencesByKey = new Map<string, number>();
  for (const k of keys) occurrencesByKey.set(k.key, (occurrencesByKey.get(k.key) ?? 0) + 1);
  const ambiguousKeys = new Set(applied.ambiguous.map((a) => a.decision.key));

  const rows = new Map<string, ReviewRow>();
  const suppressedReadKeys = new Set<string>();
  const suppressedIdentityKeys = new Set<string>();
  const rawKeyByReadKey = new Map<string, string>();
  capture.entries.forEach((e, i) => {
    const readKey = readKeyFor(e.checkKey, e.f.file, e.f.line, e.f.column);
    const rawKey = keys[i].key;
    const stale = capture.evidence.occurrences[i].lineDigest === null;
    if (stale) {
      // Stale evidence: NO key (none that repeats, none that matches) —
      // the finding stays visible and is not decidable this run.
      rows.set(readKey, { stale: true });
      return;
    }
    rawKeyByReadKey.set(readKey, rawKey);
    const d = applied.byKey.get(rawKey);
    if (d !== undefined) {
      suppressedReadKeys.add(readKey);
      suppressedIdentityKeys.add(rawKey);
      rows.set(readKey, {
        key: encodeKey(rawKey),
        decision: { disposition: d.disposition, reason: d.reason, actor: d.actor, updatedAt: d.updatedAt },
      });
    } else {
      // Sharing is a property of the CAPTURE, not of decisions: a key
      // held by N>1 identical occurrences is ambiguous whether or not a
      // decision exists — recording must refuse before the rescan would
      // hold it back (the loop-2 desync, killed at the source).
      const copies = occurrencesByKey.get(rawKey) ?? 1;
      rows.set(readKey, {
        key: encodeKey(rawKey),
        ...(copies > 1 || ambiguousKeys.has(rawKey) ? { ambiguous: Math.max(copies, 1) } : {}),
      });
    }
  });

  return {
    rows,
    suppressedReadKeys,
    suppressedIdentityKeys,
    rawKeyByReadKey,
    accepted: [...applied.byKey.values()].filter((d) => d.disposition === "accepted").length,
    notApplicable: [...applied.byKey.values()].filter((d) => d.disposition === "not-applicable").length,
    reassessing: [
      ...applied.reassessing.map((ra) => ({ checkKey: ra.decision.checkKey, file: ra.decision.file, reason: ra.decision.reason })),
      ...incompatible.map((d) => ({ checkKey: d.checkKey, file: d.file, reason: `the doctor changed since this decision was recorded — ${d.reason}` })),
    ],
    ambiguous: applied.ambiguous.map((a) => ({ checkKey: a.decision.checkKey, file: a.decision.file, occurrences: a.occurrences, reason: a.decision.reason })),
    dormant: applied.dormant.length,
    decisions,
    provenance,
  };
}

// Recording and reversing return the NEXT view — the laws (exact-key
// application, ambiguity hold-back, reassessment) re-derive from the
// updated list instead of being hand-maintained beside it.
export function withDecision(view: ReviewView, record: DecisionRecord, encodeKey: (raw: string) => string, capture: ScanCapture, provenance: ScanProvenance = emptyProvenance()): ReviewView {
  const decisions = [...view.decisions.filter((d) => d.key !== record.key), record];
  return reviewOf(capture, decisions, encodeKey, provenance);
}

export function withoutDecision(view: ReviewView, key: string, encodeKey: (raw: string) => string, capture: ScanCapture, provenance: ScanProvenance = emptyProvenance()): ReviewView {
  const decisions = view.decisions.filter((d) => d.key !== key);
  return reviewOf(capture, decisions, encodeKey, provenance);
}
