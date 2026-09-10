import * as fs from "fs";
import * as path from "path";
import { analysisStatus, analyzeBindings, analyzeSpans, analyzeCalls } from "./analysis.js";
import { searchBase, withinBase } from "./search-host.js";
// One cache per host process. The host lives in the runner process, so
// the lifetime is the any-doctor invocation; across a cohort's doctors
// the same unchanged file answers from memory.
const modelCache = new Map();
const callsCache = new Map();
const spansCache = new Map();
// Test seam: the model cache is keyed by mtime+size for the process
// lifetime; tests bust it between cases. Invisible to slop-doctor's
// default run (test-file consumers are the documented narrowing).
export function clearAnalysisCache() {
    modelCache.clear();
    spansCache.clear();
    callsCache.clear();
}
export function handleAnalysisRequest(req, mode, analyzer = analyzeBindings, status = analysisStatus, spansAnalyzer = analyzeSpans, callsAnalyzer = analyzeCalls) {
    const base = searchBase(mode);
    const root = typeof req.root === "string" ? path.resolve(req.root) : "";
    if (base === "" || !withinBase(root, base)) {
        return { error: "ctx.analysis failed: analysis root is outside the allowed target" };
    }
    if (req.kind === "available") {
        const s = status();
        return s.available ? { available: true } : { available: false, reason: s.reason };
    }
    if (req.kind === "bindings" || req.kind === "spans" || req.kind === "calls") {
        if (typeof req.file !== "string" || req.file === "") {
            return { error: `ctx.analysis.${req.kind} needs a "file" path` };
        }
        const abs = path.resolve(root, req.file);
        if (!withinBase(abs, root)) {
            return { error: `ctx.analysis failed: file is outside the search root: ${req.file}` };
        }
        if (req.kind === "bindings") {
            return cachedModel(abs, root, modelCache, analyzer, req.file);
        }
        if (req.kind === "calls")
            return cachedModel(abs, root, callsCache, callsAnalyzer, req.file);
        return cachedModel(abs, root, spansCache, spansAnalyzer, req.file);
    }
    return { error: `unknown analysis kind ${JSON.stringify(req.kind)} — known kinds: available, bindings, spans, calls` };
}
// The shared per-file model lifecycle: stat (cache hit on mtime+size),
// read, compute, cache. Bindings and spans are the same policy over two
// analyzers and two caches.
function cachedModel(abs, root, cache, compute, relFile) {
    let source;
    let mtimeMs;
    let size;
    try {
        const stat = fs.statSync(abs);
        mtimeMs = stat.mtimeMs;
        size = stat.size;
        const cached = cache.get(abs);
        if (cached && cached.mtimeMs === mtimeMs && cached.size === size)
            return { file: cached.file };
        source = fs.readFileSync(abs, "utf8");
    }
    catch {
        return { error: `ctx.analysis failed: cannot read ${relFile}` };
    }
    const rel = path.relative(root, abs);
    const r = compute(rel, source);
    if (!r.ok)
        return { error: r.error };
    cache.set(abs, { mtimeMs, size, file: r.file });
    return { file: r.file };
}
