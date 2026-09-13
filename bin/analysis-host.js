import { createHash } from "node:crypto";
import { projectConsumers } from "./project-consumers.js";
import { functionStructures } from "./function-structure.js";
import * as fs from "fs";
import * as path from "path";
import { searchBase, withinBase, withinDir } from "./contract.js";
import { analysisStatus, analyzeBindings, analyzeSpans, analyzeCalls } from "./analysis.js";
// One cache per host process. The host lives in the runner process, so
// the lifetime is the any-doctor invocation; across a cohort's doctors
// the same unchanged file answers from memory.
const modelCache = new Map();
const callsCache = new Map();
const spansCache = new Map();
// Test seam: the model cache is keyed by content digest for the process
// lifetime; tests bust it between cases. Invisible to slop's
// default run. Consumer graphs include test evidence independently.
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
    if (typeof req.file === "string" && req.sourceDigest !== undefined) {
        try {
            const abs = path.resolve(root, req.file);
            if (!withinDir(abs, root) || !withinDir(fs.realpathSync(abs), fs.realpathSync(root)))
                return { error: "analysis file outside root" };
            const digest = createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
            if (digest !== req.sourceDigest)
                return { error: `source changed during analysis: ${req.file}` };
        }
        catch (e) {
            return { error: String(e) };
        }
    }
    if (req.kind === "project" || req.kind === "structures") {
        try {
            if (!status().available)
                return { error: "consumer/structure analysis unavailable" };
            if (req.kind === "project")
                return { project: projectConsumers(root) };
            if (typeof req.file !== "string" || !req.file)
                return { error: "structures needs a file" };
            const abs = path.resolve(root, req.file);
            if (!withinDir(abs, root) || !withinDir(fs.realpathSync(abs), fs.realpathSync(root)))
                return { error: "structure file is outside root" };
            return { structures: functionStructures(req.file, fs.readFileSync(abs, "utf8")) };
        }
        catch (e) {
            return { error: String(e) };
        }
    }
    if (req.kind === "bindings" || req.kind === "spans" || req.kind === "calls") {
        if (typeof req.file !== "string" || req.file === "") {
            return { error: `ctx.analysis.${req.kind} needs a "file" path` };
        }
        const abs = path.resolve(root, req.file);
        if (!withinDir(abs, root)) {
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
// The shared per-file model lifecycle: read (cache hit on content digest),
// read, compute, cache. Bindings and spans are the same policy over two
// analyzers and two caches.
function cachedModel(abs, root, cache, compute, relFile) {
    let source;
    let digest;
    try {
        if (!withinDir(fs.realpathSync(abs), fs.realpathSync(root)))
            return { error: "analysis file outside root" };
        source = fs.readFileSync(abs, "utf8");
        digest = createHash("sha256").update(source).digest("hex");
        const cached = cache.get(abs);
        if (cached && cached.digest === digest)
            return { file: cached.file };
    }
    catch {
        return { error: `ctx.analysis failed: cannot read ${relFile}` };
    }
    const rel = path.relative(root, abs);
    const r = compute(rel, source);
    if (!r.ok)
        return { error: r.error };
    cache.set(abs, { digest, file: r.file });
    return { file: r.file };
}
