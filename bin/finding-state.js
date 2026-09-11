import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
// The finding-state module (lifecycle M2): remembered decisions — a
// reasoned accepted / not-applicable disposition attached to a finding's
// IDENTITY key, recorded from the dashboard or the CLI, reversible,
// applied on later scans. The storage decision (D31): a flat, versioned
// JSON file with atomic replacement, NOT SQLite — decisions-only volume
// is tiny (a user's reviewed findings in one checkout), the atomic
// rename gives interruption safety, and the native-binding matrix is
// avoided entirely. SQLite is reconsidered the moment observations or
// history arrive (M4): the coupling rule is auto-history ⇒ a database.
//
// Honesty laws carried over from the design, enforced here:
//   - Lazy: no file exists until the first decision; reads without a
//     file are an empty state, never an error, and scans never require
//     state (no init anywhere).
//   - Loud corruption: an unparseable or malformed file is a named
//     error — never silently reset (a silent reset would delete the
//     only copy of local decisions).
//   - Local scope only in M2: the record carries scope "local"; project
//     scope (Git-tracked, shared, CI-visible) is M3's delivery.
//   - A decision suppresses a finding from the ACTIVE list only when the
//     identity key matches exactly; same check+file with different
//     evidence is a reassessment, surfaced — never silently carried.
// Identity keys are NUL-separated internally (no content can collide
// with the separator) — but NUL cannot traverse argv (execve terminates
// on it), so every key that crosses a shell boundary is encoded as
// base64url: copyable, pasteable, and unambiguous. Found in review loop
// 3 — decide --key and decisions --reverse were unusable from any shell.
export function encodeDecisionKey(raw) {
    return Buffer.from(raw, "utf8").toString("base64url");
}
export function decodeDecisionKey(encoded) {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded))
        return null;
    try {
        return Buffer.from(encoded, "base64url").toString("utf8");
    }
    catch {
        return null;
    }
}
export const DECISIONS_SCHEMA = 1;
// The local state lives beside the scanned target. The directory is
// local-only by naming convention until M3 formalizes the tracked-vs-
// ignored layout; the filename says what it is.
export function decisionsPath(targetDir) {
    return path.join(targetDir, ".any-doctor", "decisions.local.json");
}
export function readDecisionsFile(p) {
    try {
        return { ok: true, text: fs.readFileSync(p, "utf8") };
    }
    catch (e) {
        const code = e.code;
        return code === "ENOENT"
            ? { ok: false, code: "absent" }
            : { ok: false, code: "unreadable", error: code };
    }
}
export function loadDecisions(targetDir, readFile = readDecisionsFile) {
    var _a;
    const p = decisionsPath(targetDir);
    const r = readFile(p);
    if (!r.ok && r.code === "absent")
        return { ok: true, decisions: [] };
    if (!r.ok) {
        return { ok: false, error: `${p} exists but could not be read (${(_a = r.error) !== null && _a !== void 0 ? _a : "unknown error"}) — decisions were NOT loaded and were NOT reset; fix the file's permissions by hand.` };
    }
    const text = r.text;
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (e) {
        return { ok: false, error: `${p} is not valid JSON (${e instanceof Error ? e.message : String(e)}) — decisions were NOT loaded and were NOT reset; fix or remove the file by hand.` };
    }
    if (typeof parsed !== "object" || parsed === null
        || parsed.schema !== DECISIONS_SCHEMA
        || !Array.isArray(parsed.decisions)) {
        return { ok: false, error: `${p} does not match the decisions schema (expected schema ${DECISIONS_SCHEMA}) — decisions were NOT loaded and were NOT reset; fix or remove the file by hand.` };
    }
    const decisions = parsed.decisions;
    for (const d of decisions) {
        if (typeof d !== "object" || d === null) {
            return { ok: false, error: `${p} contains a malformed decision record (null or non-object) — decisions were NOT loaded and were NOT reset; fix or remove the file by hand.` };
        }
        if (typeof d.key !== "string" || typeof d.checkKey !== "string" || typeof d.file !== "string"
            || typeof d.line !== "number" || (d.disposition !== "accepted" && d.disposition !== "not-applicable")
            || typeof d.reason !== "string" || d.reason.trim() === "" || d.scope !== "local") {
            return { ok: false, error: `${p} contains a malformed decision record (key ${JSON.stringify(d.key)}) — decisions were NOT loaded and were NOT reset; fix or remove the file by hand.` };
        }
    }
    return { ok: true, decisions };
}
// Atomic replacement (temp file + rename): an interrupted write can
// never leave a half-written decisions file. RECORDING merges per-key
// with what is on disk (re-read, union, this record wins its own key) —
// concurrent writers never lose each other's independent decisions.
// REVERSAL cannot use union semantics (a union would resurrect the
// deleted key from disk), so it overwrites with its full desired list;
// a concurrent record landing in that instant is the documented residual,
// narrower than the everyday record path it protects.
export function saveDecisions(targetDir, decisions, readFile = readDecisionsFile, writeFile = writeTextAtomic, mergeWithDisk = true) {
    const byKey = new Map();
    if (mergeWithDisk) {
        const existing = loadDecisions(targetDir, readFile);
        if (!existing.ok) {
            // recordDecision/reverseDecision pre-check and refuse; a direct
            // save onto corrupt state must not silently reset it either.
            throw new Error(existing.error);
        }
        for (const d of existing.decisions)
            byKey.set(d.key, d);
    }
    for (const d of decisions)
        byKey.set(d.key, d);
    const ordered = [...byKey.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    const file = { schema: DECISIONS_SCHEMA, decisions: ordered };
    writeFile(decisionsPath(targetDir), JSON.stringify(file, null, 2) + "\n");
}
function writeTextAtomic(p, text) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = p + "." + createHash("sha256").update(text).digest("hex").slice(0, 8) + ".tmp";
    fs.writeFileSync(tmp, text, "utf8");
    fs.renameSync(tmp, p);
}
// Record or overwrite (a second decision on the same key is a revision:
// reason updated, timestamps advance). Returns the merged record.
export function recordDecision(targetDir, input) {
    var _a, _b;
    const reason = input.reason.trim();
    if (reason === "")
        return { ok: false, error: "a decision requires a non-empty reason" };
    const existing = loadDecisions(targetDir);
    if (!existing.ok)
        return existing;
    const prior = existing.decisions.find((d) => d.key === input.key);
    const now = ((_a = input.now) !== null && _a !== void 0 ? _a : new Date()).toISOString();
    const record = {
        key: input.key,
        checkKey: input.checkKey,
        file: input.file,
        line: input.line,
        disposition: input.disposition,
        reason,
        scope: "local",
        actor: input.actor,
        createdAt: (_b = prior === null || prior === void 0 ? void 0 : prior.createdAt) !== null && _b !== void 0 ? _b : now,
        updatedAt: now,
        ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
    };
    saveDecisions(targetDir, [...existing.decisions.filter((d) => d.key !== input.key), record]);
    return { ok: true, decisions: [record], record };
}
// Reversal removes the record: the finding returns to the active list on
// the next scan. History of reversals is M4's bounded history.
export function reverseDecision(targetDir, key) {
    const existing = loadDecisions(targetDir);
    if (!existing.ok)
        return existing;
    const kept = existing.decisions.filter((d) => d.key !== key);
    if (kept.length === existing.decisions.length) {
        return { ok: false, error: `no decision found for key ${key.slice(0, 24)}…` };
    }
    saveDecisions(targetDir, kept, undefined, writeTextAtomic, false);
    return { ok: true, decisions: kept };
}
export function applyDecisions(decisions, occ) {
    var _a, _b;
    const byKey = new Map();
    const reassessing = [];
    const ambiguous = [];
    const dormant = [];
    // Cardinality, the diff layer's law, applied to decisions: a key that
    // names N>1 identical occurrences is ambiguous — no suppression.
    const occurrencesByKey = new Map();
    for (const k of occ.keys)
        occurrencesByKey.set(k.key, ((_a = occurrencesByKey.get(k.key)) !== null && _a !== void 0 ? _a : 0) + 1);
    for (const d of decisions) {
        const pair = `${d.checkKey}\u0000${d.file}`;
        if (!occ.presentPairs.has(pair)) {
            dormant.push(d);
            continue;
        }
        const count = (_b = occurrencesByKey.get(d.key)) !== null && _b !== void 0 ? _b : 0;
        if (count > 1) {
            ambiguous.push({ decision: d, occurrences: count });
        }
        else if (count === 1) {
            byKey.set(d.key, d);
        }
        else {
            reassessing.push({
                decision: d,
                currentKeys: occ.keys.filter((k) => k.checkKey === d.checkKey && k.file === d.file).map((k) => k.key),
            });
        }
    }
    return { byKey, reassessing, ambiguous, dormant };
}
