import * as fs from "fs";
import * as path from "path";
import { resolveFinding, withinDir } from "./contract.js";
import { extractEvidence, spansProvider } from "./identity.js";
export function entriesOf(groups) {
    const out = [];
    for (const g of groups) {
        for (const f of g.findings) {
            out.push({ f, g, checkKey: resolveFinding(g.meta, f).checkKey });
        }
    }
    return out;
}
export function evidenceInputOf(e) {
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
export function identityKeyOf(e, evidence) {
    var _a, _b, _c;
    return [
        e.checkKey,
        e.f.file,
        (_a = evidence.lineDigest) !== null && _a !== void 0 ? _a : `stale\u0000${e.f.file}:${e.f.line}`,
        (_b = evidence.contextId) !== null && _b !== void 0 ? _b : "\u0000none",
        (_c = evidence.relColumn) !== null && _c !== void 0 ? _c : "-",
        evidence.scope,
    ].join("\u0000");
}
// Evidence reads stay inside the scanned root — a finding's file string is
// doctor-supplied data, and the host's read must not become an escape hatch
// the confined doctor itself could never take. withinDir is the strict
// containment form's one home (a scan root is a directory, not a prefix).
export function readFileFrom(root) {
    const containmentRoot = path.resolve(root);
    return (rel) => {
        const abs = path.resolve(root, rel);
        if (!withinDir(abs, containmentRoot))
            return null;
        try {
            return fs.readFileSync(abs, "utf8");
        }
        catch {
            return null;
        }
    };
}
export function captureScan(targetDir, groups, analysisAvailable, digests) {
    const entries = entriesOf(groups);
    const reader = readFileFrom(targetDir);
    const sources = new Map();
    for (const input of entries.map(evidenceInputOf)) {
        if (!sources.has(input.file)) {
            const source = reader(input.file);
            if (source !== null)
                sources.set(input.file, source);
        }
    }
    const fromCapture = (file) => { var _a; return (_a = sources.get(file)) !== null && _a !== void 0 ? _a : null; };
    const evidence = extractEvidence(entries.map(evidenceInputOf), fromCapture, spansProvider(analysisAvailable));
    return { groups, entries, analysisAvailable, digests, evidence, sources };
}
// The consistency recheck: if a file changed on disk since its
// scan-adjacent capture, the capture no longer describes the working tree
// this run is reporting on — every occurrence in that file goes stale
// (never a false continuity through borrowed bytes). What this cannot
// catch is an edit DURING a scan itself — a documented residual, never a
// guarantee.
export function invalidateChangedFiles(capture, targetDir) {
    if (capture.sources.size === 0)
        return;
    const reader = readFileFrom(targetDir);
    const changed = new Set();
    for (const [file, captured] of capture.sources) {
        if (reader(file) !== captured)
            changed.add(file);
    }
    if (changed.size === 0)
        return;
    for (const o of capture.evidence.occurrences) {
        if (changed.has(o.file))
            o.lineDigest = null;
    }
}
