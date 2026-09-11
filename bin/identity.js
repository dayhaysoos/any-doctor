import { createHash } from "crypto";
import * as fs from "fs";
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
// Digest the exact program bytes that are ABOUT to run. Captured before
// the scan it will describe — a digest read after both scans sees only
// the latest bytes and cannot tell the two executions apart (review
// finding 2: a doctor mutated between head and base execution still
// reported comparable). Within one diff the two captures bracket their
// own scans; a change between them makes the digests differ, refusing
// continuity — the correct verdict for two different detectors.
export function doctorDigests(doctors, readProgram) {
    return doctors.map((d) => {
        var _a;
        return ({
            doctorId: d.id,
            digest: digestOf((_a = readProgram(d.programPath)) !== null && _a !== void 0 ? _a : "<unreadable>"),
        });
    });
}
// A plain file read for digesting: null, never a throw.
export function digestTextFile(programPath) {
    try {
        return fs.readFileSync(programPath, "utf8");
    }
    catch {
        return null;
    }
}
export function scanProvenance(doctors, analysisAvailable, digests) {
    return {
        schema: IDENTITY_SCHEMA_VERSION,
        doctors: digests,
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
// A doctor-supplied evidence range is trusted only when the host can
// validate it against the captured source: it must start at the finding,
// lie within the file, be non-degenerate, and stay bounded (a whole-file
// "range" is not evidence — it is the whole-file-hash mistake in
// miniature). Anything else falls back to the line digest, line-scoped.
const EVIDENCE_MAX_LINES = 50;
function validatedRange(f, lines) {
    var _a, _b;
    const e = f.evidence;
    if (e === undefined)
        return null;
    if (!Number.isInteger(e.endLine))
        return null;
    if (e.endLine < f.line || e.endLine > lines.length)
        return null;
    if (e.endLine - f.line + 1 > EVIDENCE_MAX_LINES)
        return null;
    if (e.endColumn !== undefined) {
        if (!Number.isInteger(e.endColumn) || e.endColumn < 0)
            return null;
        const lastLine = stripCr((_a = lines[e.endLine - 1]) !== null && _a !== void 0 ? _a : "");
        if (e.endColumn > lastLine.length)
            return null;
        if (e.endLine === f.line && ((_b = f.column) !== null && _b !== void 0 ? _b : 0) >= e.endColumn)
            return null;
    }
    return e;
}
function stripCr(raw) {
    return raw.endsWith("\r") ? raw.slice(0, -1) : raw;
}
// The covered span's text: from the finding's start position (or the
// line's start when no column) through the exclusive end.
function rangeText(lines, f, range) {
    var _a, _b;
    const startCol = (_a = f.column) !== null && _a !== void 0 ? _a : 0;
    const first = stripCr(lines[f.line - 1]).slice(startCol);
    if (range.endLine === f.line) {
        const end = (_b = range.endColumn) !== null && _b !== void 0 ? _b : stripCr(lines[f.line - 1]).length;
        return first.slice(0, Math.max(0, end - startCol));
    }
    const middles = [];
    for (let l = f.line + 1; l < range.endLine; l++)
        middles.push(stripCr(lines[l - 1]));
    const last = stripCr(lines[range.endLine - 1]);
    const lastText = range.endColumn !== undefined ? last.slice(0, range.endColumn) : last;
    return [first, ...middles, lastText].join("\n");
}
// ---- extraction ---------------------------------------------------------
function digestOf(normalized) {
    return createHash("sha256").update(normalized, "utf8").digest("hex");
}
// Token-aware normalization: whitespace runs collapse ONLY in code
// regions. String, template, and regex interiors stay byte-exact —
// `"a  b"` and `"a b"` are different literals, and formatting tolerance
// must never erase a semantic change (A1's law). A one-pass quote-state
// scanner decides what is code: apostrophes inside `//` comments never
// open literals, escapes don't close, and a `/` after a position where
// an expression cannot start (operators, `(`, `,`, `=`, keywords like
// return) opens a regex literal. Any line the scanner cannot resolve —
// an unterminated literal start (a multiline template's opening line)
// or a guessed regex that never closes — falls back to end-trim-only
// normalization: byte-honest, merely less reformat-tolerant. Wrong
// guesses fail conservative: division misread as regex keeps content
// verbatim (no collapse); the reverse is why regex detection requires
// the cannot-start-an-expression context, the common regex positions.
const REGEX_MAY_FOLLOW = new Set(["", "(", "[", "{", ",", ";", ":", "=", "!", "&", "|", "?", "+", "-", "*", "%", "~", "^", "<", ">", "=>"]);
const REGEX_PRECEDING_KEYWORDS = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "case", "do", "else", "yield", "await"]);
function normalizeLine(raw) {
    var _a;
    const out = [];
    let spacePending = false;
    let quote = null;
    // prevToken is the last significant code token: a punctuation char or a
    // completed identifier word. Whitespace never clears it — `return /a/`
    // must keep the keyword context across the space.
    let prevToken = "";
    let word = "";
    let ambiguous = false;
    let i = 0;
    const flushSpace = () => {
        if (spacePending && out.length > 0) {
            out.push(" ");
            spacePending = false;
        }
    };
    const completeWord = () => {
        if (word !== "") {
            prevToken = word;
            word = "";
        }
    };
    while (i < raw.length) {
        const ch = raw[i];
        if (quote !== null) {
            out.push(ch);
            if (ch === "\\" && i + 1 < raw.length) {
                out.push(raw[i + 1]);
                i += 2;
                continue;
            }
            if (quote === "/" && ch === "[") {
                // Character class: everything (including '/') is verbatim until ].
                let j = i + 1;
                while (j < raw.length) {
                    out.push(raw[j]);
                    if (raw[j] === "\\") {
                        out.push((_a = raw[j + 1]) !== null && _a !== void 0 ? _a : "");
                        j += 2;
                        continue;
                    }
                    if (raw[j] === "]")
                        break;
                    j++;
                }
                i = j + 1;
                continue;
            }
            if (ch === quote)
                quote = null;
            i++;
            continue;
        }
        if (/\s/.test(ch)) {
            spacePending = out.length > 0;
            completeWord();
            i++;
            continue;
        }
        if (ch === "/" && raw[i + 1] === "/") {
            completeWord();
            flushSpace();
            out.push("//");
            i += 2;
            while (i < raw.length) {
                const c = raw[i];
                if (/\s/.test(c)) {
                    spacePending = true;
                    i++;
                    continue;
                }
                if (spacePending) {
                    out.push(" ");
                    spacePending = false;
                }
                out.push(c);
                i++;
            }
            break;
        }
        if (ch === "'" || ch === "`" || ch === '"') {
            completeWord();
            flushSpace();
            out.push(ch);
            quote = ch;
            i++;
            continue;
        }
        if (/[A-Za-z0-9_$]/.test(ch)) {
            word += ch;
            out.push(ch);
            spacePending = false;
            i++;
            continue;
        }
        completeWord();
        if (ch === "/" && (REGEX_MAY_FOLLOW.has(prevToken) || REGEX_PRECEDING_KEYWORDS.has(prevToken))) {
            flushSpace();
            out.push(ch);
            quote = "/";
            prevToken = "";
            i++;
            continue;
        }
        flushSpace();
        out.push(ch);
        prevToken = ch;
        spacePending = false;
        i++;
    }
    completeWord();
    if (quote !== null)
        ambiguous = true;
    if (ambiguous)
        return raw.trim();
    return out.join("").trim();
}
export function extractEvidence(findings, readSource, spansFor) {
    var _a;
    const occurrences = [];
    const unreadableFiles = [];
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
            occurrences.push({ ...f, lineDigest: null, relColumn: null, contextId: null, scope: "line" });
            continue;
        }
        const raw = facts.lines[f.line - 1];
        if (raw === undefined) {
            occurrences.push({ ...f, lineDigest: null, relColumn: null, contextId: null, scope: "line" });
            continue;
        }
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        const indent = line.length - line.trimStart().length;
        const range = validatedRange(f, facts.lines);
        occurrences.push({
            ...f,
            lineDigest: range !== null
                ? digestOf(normalizeLine(rangeText(facts.lines, f, range)))
                : digestOf(normalizeLine(line)),
            relColumn: f.column !== undefined ? Math.max(0, f.column - indent) : null,
            contextId: facts.ids !== null ? enclosingContext(facts.spans, facts.ids, f.line, (_a = f.column) !== null && _a !== void 0 ? _a : 0) : null,
            scope: range !== null ? "range" : "line",
        });
    }
    return { occurrences, unreadableFiles, contextUnavailableFiles };
}
// Stable identity for each function-like span: kind + name + its ordinal
// among same-named same-kind spans in positional order. Ordinals shift only
// when an identically-named sibling is inserted above — a conservative
// break, never a false continuity. Anonymous spans carry a NUL separator —
// no identifier contains one, so a function literally named "anon" can
// never collide with an anonymous arrow's bucket.
function contextIds(spans) {
    var _a, _b;
    const ids = new Map();
    const order = new Map();
    const sorted = [...spans].sort((a, b) => a.line - b.line || a.column - b.column || a.endLine - b.endLine || a.endColumn - b.endColumn);
    for (const s of sorted) {
        const key = `${s.kind}:${(_a = s.name) !== null && _a !== void 0 ? _a : ""}`;
        const n = (_b = order.get(key)) !== null && _b !== void 0 ? _b : 0;
        order.set(key, n + 1);
        ids.set(s, s.name === null ? `${s.kind}:\u0000${n}` : `${s.kind}:${s.name}#${n}`);
    }
    return ids;
}
// Narrower by (line extent, then column extent) compared as a tuple — a
// mixed-radix scalar would misorder when columns exceed the radix (minified
// single-line files).
function narrower(a, b) {
    const al = a.endLine - a.line;
    const bl = b.endLine - b.line;
    return al !== bl ? al < bl : a.endColumn - a.column < b.endColumn - b.column;
}
// The innermost span containing the position: a nested callback or shadowed
// receiver binds to its own function, not the outer one.
function enclosingContext(spans, ids, line, column) {
    var _a;
    let best = null;
    for (const s of spans) {
        const startsAtOrBefore = s.line < line || (s.line === line && s.column <= column);
        const endsAfter = s.endLine > line || (s.endLine === line && s.endColumn > column);
        if (startsAtOrBefore && endsAfter && (best === null || narrower(s, best))) {
            best = s;
        }
    }
    return best !== null ? (_a = ids.get(best)) !== null && _a !== void 0 ? _a : null : null;
}
function fullKey(e) {
    var _a, _b;
    return [e.checkKey, e.file, e.lineDigest, (_a = e.contextId) !== null && _a !== void 0 ? _a : "\u0000none", (_b = e.relColumn) !== null && _b !== void 0 ? _b : "-", e.scope].join("\u0000");
}
export function compareOccurrences(base, head) {
    const pairs = [];
    const ambiguousBuckets = new Set();
    let lineScopedPairs = 0;
    // Stale or unreadable evidence never enters matching: no content, no
    // confident identity — a stale head occurrence is added, a stale base
    // occurrence is absent. (Buckets hold only digested entries, so a stale
    // pair can never collide into a false continuity.) Each bucket consumes
    // through a cursor — identical duplicates match in linear time; the old
    // rows.find rescan was quadratic (1.7s at 30k duplicates).
    const baseBuckets = new Map();
    base.forEach((e, index) => {
        var _a;
        if (e.lineDigest === null)
            return;
        const key = fullKey(e);
        const bucket = (_a = baseBuckets.get(key)) !== null && _a !== void 0 ? _a : { indices: [], next: 0 };
        bucket.indices.push(index);
        baseBuckets.set(key, bucket);
    });
    const consumedBase = new Set();
    const addedIndices = [];
    head.forEach((e, headIndex) => {
        if (e.lineDigest === null) {
            addedIndices.push(headIndex);
            return;
        }
        const key = fullKey(e);
        const bucket = baseBuckets.get(key);
        if (bucket !== undefined && bucket.next < bucket.indices.length) {
            const baseIndex = bucket.indices[bucket.next++];
            consumedBase.add(baseIndex);
            pairs.push({
                baseIndex,
                headIndex,
                contextFallback: e.contextId === null || base[baseIndex].contextId === null,
            });
            if (e.scope === "line" || base[baseIndex].scope === "line")
                lineScopedPairs++;
            if (bucket.indices.length > 1)
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
        lineScoped: lineScopedPairs,
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
