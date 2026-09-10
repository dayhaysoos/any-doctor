import { createHash } from "crypto";
import { analysisStatus, analyzeSpans } from "./analysis.js";
// The identity layer (analysis-improvements A1): host-derived occurrence
// evidence and a versioned, conservative matching scheme, consumed by the
// stateless Git-base comparison (A2). It answers the one question
// compareFindings cannot: is this the same occurrence as that one, after the
// code moved? compareFindings stays the fixture gate untouched —
// certification must keep failing findings emitted at wrong locations.
//
// The evidence model (schema 1), host-derived end to end so no existing
// doctor changes:
//   - checkKey (doctorId/rule): namespace separation — two doctors using the
//     same rule name never share continuity.
//   - file: the finding's root-relative path, identical on both sides of a
//     diff because the base worktree mirrors the checkout's layout.
//   - lineDigest: sha256 of the finding's own line, whitespace-normalized
//     (CR stripped, indentation trimmed, inner whitespace runs collapsed).
//     The line — not a window, not the whole file — so an unrelated edit on
//     a neighboring line cannot break continuity, while any edit to the
//     flagged line itself (operator, literal, receiver on that line) does.
//   - relColumn: the finding's column relative to the line's first
//     non-whitespace character, so reindentation preserves it while two
//     same-line occurrences stay distinct.
//   - contextId: innermost enclosing function-like span (kind:name#ordinal)
//     when the analysis engine parses the file; null when it cannot — never
//     invented. Context keeps identical text in two different functions from
//     sharing one identity; a null on either side means that side could not
//     verify structure, and such pairs do NOT match when the other side
//     claims a context — a parse failure between the two scans is a source
//     change, and it surfaces as added/absent instead of a guessed
//     continuity.
//
// Coordinates stay line/column everywhere (ctx.search's convention: 1-based
// lines, 0-based columns, exclusive ends). No byte offsets are joined across
// engines — ast-grep's JSON offsets are UTF-8 while the analysis model is
// UTF-16, so the canonical representation here is (line, column) plus a
// content digest computed from the decoded string, which is
// encoding-independent by construction.
//
// Snapshot policy: evidence comes from ONE read of each file that produced
// findings (bounded — untouched files cost nothing), and the digest and the
// structural context derive from those same bytes, so evidence is internally
// consistent. A file edited after its doctor scanned it yields evidence for
// the NEW bytes: either the flagged line changed (match breaks —
// conservative) or the line itself is unchanged (the evidence was true
// anyway). A finding whose line no longer exists in the read content is
// stale and never matches. mtime/size are trusted nowhere.
//
// Matching is one multiset pass over the full key — cardinality preserved,
// so a third identical occurrence can never hide behind the two that
// existed. Occasions with no structural context on either side share the
// "none" bucket: that IS the engine-off fallback, content plus namespace
// plus file (React Doctor's proven scheme), and every such match is flagged
// contextFallback so the degradation stays visible. Uncertainty is counted
// and surfaced (contextFallback, ambiguous, stale), never smoothed over; an
// unmatched occurrence is added/absent, so the gate only ever sees more
// findings, never fewer.
export const IDENTITY_SCHEMA_VERSION = 1;
export function scanProvenance(doctors, analysisAvailable, readProgram) {
    return {
        schema: IDENTITY_SCHEMA_VERSION,
        doctors: doctors.map((d) => {
            var _a;
            return ({
                doctorId: d.id,
                digest: digestOf((_a = readProgram(d.programPath)) !== null && _a !== void 0 ? _a : "<unreadable>"),
            });
        }),
        analysisAvailable,
    };
}
// Scans are comparable for identity purposes when the same doctor programs
// ran on both sides. Analysis availability may differ per side (per-file
// parse failures degrade visibly); doctor programs may not — a changed
// detector supports a detector comparison, not a code-movement claim.
export function comparableScans(base, head) {
    if (base.doctors.length !== head.doctors.length)
        return false;
    return base.doctors.every((d, i) => d.doctorId === head.doctors[i].doctorId && d.digest === head.doctors[i].digest);
}
// ---- extraction ---------------------------------------------------------
function digestOf(normalized) {
    return createHash("sha256").update(normalized, "utf8").digest("hex");
}
// CR stripped, whitespace runs collapsed, ends trimmed: two spellings of the
// same code (indentation, CRLF, aligned spacing) share one digest, while any
// change to operators, literals, or identifiers on the line does not.
function normalizeLine(raw) {
    return raw.replace(/\s+/g, " ").trim();
}
export function extractEvidence(findings, readSource, spansFor) {
    var _a;
    const occurrences = [];
    const unreadableFiles = [];
    const staleLines = [];
    const contextUnavailableFiles = [];
    const fileFacts = new Map();
    for (const f of findings) {
        if (fileFacts.has(f.file))
            continue;
        const source = readSource(f.file);
        if (source === null) {
            unreadableFiles.push(f.file);
            fileFacts.set(f.file, { lines: null, spans: null, ids: null });
            continue;
        }
        const spans = spansFor(f.file, source);
        if (spans === null)
            contextUnavailableFiles.push(f.file);
        fileFacts.set(f.file, {
            lines: source.split("\n"),
            spans,
            ids: spans !== null ? contextIds(spans) : null,
        });
    }
    // Emission preserves the INPUT order exactly — callers zip the returned
    // array with their findings by index, and a doctor's findings interleave
    // files across checks, so any regrouping here would misattribute every
    // comparison index.
    for (const f of findings) {
        const facts = fileFacts.get(f.file);
        if (facts.lines === null) {
            occurrences.push({ ...f, lineDigest: null, relColumn: null, contextId: null });
            continue;
        }
        const raw = facts.lines[f.line - 1];
        if (raw === undefined) {
            staleLines.push(`${f.file}:${f.line}`);
            occurrences.push({ ...f, lineDigest: null, relColumn: null, contextId: null });
            continue;
        }
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        const indent = line.length - line.trimStart().length;
        occurrences.push({
            ...f,
            lineDigest: digestOf(normalizeLine(line)),
            relColumn: f.column !== undefined ? Math.max(0, f.column - indent) : null,
            contextId: facts.ids !== null ? enclosingContext(facts.spans, facts.ids, f.line, (_a = f.column) !== null && _a !== void 0 ? _a : 0) : null,
        });
    }
    return { occurrences, unreadableFiles, staleLines, contextUnavailableFiles };
}
// Stable identity for each function-like span: kind + name + its ordinal
// among same-named same-kind spans in positional order. Ordinals shift only
// when an identically-named sibling is inserted above — a conservative
// break, never a false continuity.
function contextIds(spans) {
    var _a, _b;
    const ids = new Map();
    const order = new Map();
    const sorted = [...spans].sort((a, b) => a.line - b.line || a.column - b.column || a.endLine - b.endLine || a.endColumn - b.endColumn);
    for (const s of sorted) {
        const key = `${s.kind}:${(_a = s.name) !== null && _a !== void 0 ? _a : ""}`;
        const n = (_b = order.get(key)) !== null && _b !== void 0 ? _b : 0;
        order.set(key, n + 1);
        ids.set(s, s.name === null ? `${s.kind}:anon#${n}` : `${s.kind}:${s.name}#${n}`);
    }
    return ids;
}
// The innermost span containing the position: a nested callback or shadowed
// receiver binds to its own function, not the outer one.
function enclosingContext(spans, ids, line, column) {
    var _a;
    let best = null;
    let bestExtent = Number.POSITIVE_INFINITY;
    for (const s of spans) {
        const startsAtOrBefore = s.line < line || (s.line === line && s.column <= column);
        const endsAfter = s.endLine > line || (s.endLine === line && s.endColumn > column);
        if (startsAtOrBefore && endsAfter) {
            const extent = (s.endLine - s.line) * 1000000 + (s.endColumn - s.column);
            if (extent < bestExtent) {
                best = s;
                bestExtent = extent;
            }
        }
    }
    return best !== null ? (_a = ids.get(best)) !== null && _a !== void 0 ? _a : null : null;
}
function fullKey(e) {
    var _a, _b;
    return [e.checkKey, e.file, e.lineDigest, (_a = e.contextId) !== null && _a !== void 0 ? _a : "\u0000none", (_b = e.relColumn) !== null && _b !== void 0 ? _b : "-"].join("\u0000");
}
export function compareOccurrences(base, head) {
    const pairs = [];
    const ambiguousBuckets = new Set();
    // Stale or unreadable evidence never enters matching: no content, no
    // confident identity — a stale head occurrence is added, a stale base
    // occurrence is absent. (Buckets hold only digested entries, so a stale
    // pair can never collide into a false continuity.)
    const baseBuckets = new Map();
    base.forEach((e, index) => {
        var _a;
        if (e.lineDigest === null)
            return;
        const key = fullKey(e);
        const rows = (_a = baseBuckets.get(key)) !== null && _a !== void 0 ? _a : [];
        rows.push({ index, used: false });
        baseBuckets.set(key, rows);
    });
    const consumedBase = new Set();
    const addedIndices = [];
    head.forEach((e, headIndex) => {
        if (e.lineDigest === null) {
            addedIndices.push(headIndex);
            return;
        }
        const key = fullKey(e);
        const rows = baseBuckets.get(key);
        const free = rows === null || rows === void 0 ? void 0 : rows.find((r) => !r.used);
        if (free !== undefined) {
            free.used = true;
            consumedBase.add(free.index);
            pairs.push({
                baseIndex: free.index,
                headIndex,
                contextFallback: e.contextId === null || base[free.index].contextId === null,
            });
            if (rows.length > 1)
                ambiguousBuckets.add(key);
        }
        else {
            addedIndices.push(headIndex);
        }
    });
    const absentIndices = base.map((_, index) => index).filter((index) => !consumedBase.has(index));
    return {
        pairs,
        addedIndices,
        absentIndices,
        ambiguous: ambiguousBuckets.size,
        stale: base.filter((e) => e.lineDigest === null).length + head.filter((e) => e.lineDigest === null).length,
    };
}
// The spans provider the diff path uses: the same analysis stack the doctor
// ran with, called in the host process on the bytes already read for
// evidence. Returns null whenever context cannot be established honestly.
export function spansProvider(engineOn) {
    if (!engineOn)
        return () => null;
    return (file, source) => {
        const r = analyzeSpans(file, source);
        return r.ok ? r.file.spans : null;
    };
}
export function analysisEngineAvailable() {
    return analysisStatus().available;
}
