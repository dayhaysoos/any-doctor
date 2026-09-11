import { applyDecisions } from "./finding-state.js";
import { readKeyFor } from "./contract.js";
import { identityKeyOf } from "./scan-capture.js";
export const emptyProvenance = () => ({ revisions: new Map(), programDigests: new Map() });
// Compatible when the revision is declared and unchanged, OR no revision
// is involved anywhere and the program digest is unchanged. Unknown
// (missing provenance on either side) is INCOMPATIBLE — reassessment,
// never silent reuse.
export function provenanceCompatible(recorded, scan, checkKey) {
    if (recorded === undefined)
        return false;
    // A matching authored revision is compatible regardless of digest
    // churn (the point of revisions); a byte-identical program is
    // compatible regardless of declarations. --key decisions record only
    // the digest, so a revision-declaring check must accept its own
    // unchanged program (review probe: revision:1 rejected its own
    // freshly-recorded decision).
    const scanRevision = scan.revisions.get(checkKey);
    if (recorded.revision !== undefined && scanRevision !== undefined && recorded.revision === scanRevision)
        return true;
    const doctorId = checkKey.split("/")[0];
    const scanDigest = scan.programDigests.get(doctorId);
    return recorded.programDigest !== undefined && scanDigest !== undefined && recorded.programDigest === scanDigest;
}
export function reviewOf(capture, decisions, encodeKey, provenance = emptyProvenance()) {
    var _a;
    const keys = capture.entries.map((e, i) => ({
        key: identityKeyOf(e, capture.evidence.occurrences[i]),
        checkKey: e.checkKey,
        file: e.f.file,
        line: e.f.line,
    }));
    const occ = {
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
    const occurrencesByKey = new Map();
    for (const k of keys)
        occurrencesByKey.set(k.key, ((_a = occurrencesByKey.get(k.key)) !== null && _a !== void 0 ? _a : 0) + 1);
    const ambiguousKeys = new Set(applied.ambiguous.map((a) => a.decision.key));
    const rows = new Map();
    const suppressedReadKeys = new Set();
    const suppressedIdentityKeys = new Set();
    const rawKeyByReadKey = new Map();
    capture.entries.forEach((e, i) => {
        var _a;
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
        }
        else {
            // Sharing is a property of the CAPTURE, not of decisions: a key
            // held by N>1 identical occurrences is ambiguous whether or not a
            // decision exists — recording must refuse before the rescan would
            // hold it back (the loop-2 desync, killed at the source).
            const copies = (_a = occurrencesByKey.get(rawKey)) !== null && _a !== void 0 ? _a : 1;
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
export function withDecision(view, record, encodeKey, capture, provenance = emptyProvenance()) {
    const decisions = [...view.decisions.filter((d) => d.key !== record.key), record];
    return reviewOf(capture, decisions, encodeKey, provenance);
}
export function withoutDecision(view, key, encodeKey, capture, provenance = emptyProvenance()) {
    const decisions = view.decisions.filter((d) => d.key !== key);
    return reviewOf(capture, decisions, encodeKey, provenance);
}
