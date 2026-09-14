import { createHash } from "node:crypto";
import { projectConsumers } from "./project-consumers.js";
import { functionStructures } from "./function-structure.js";
import * as fs from "fs";
import * as path from "path";
import { searchBase, SEMANTIC_RESULT_VERSION, withinBase, withinDir } from "./contract.js";
import { analysisStatus, analyzeBindings, analyzeSpans, analyzeCalls } from "./analysis.js";
import { identityResult, optionPresenceResult, requiredOptionRecipeResult, resourceLifetimeResult, resourceWithoutReleaseRecipeResult, unhandledValueRecipeResult, valueDispositionResult } from "./doctor-sdk.js";
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
    if ((req.kind === "identity" || req.kind === "value-disposition" || req.kind === "resource-lifetime" || req.kind === "option-presence" || req.kind === "recipe-unhandled-value" || req.kind === "recipe-resource-without-release" || req.kind === "recipe-required-option") && !status().available) {
        return { semantic: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "analysis-unavailable" } };
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
    if (req.kind === "bindings" || req.kind === "spans" || req.kind === "calls" || req.kind === "identity" || req.kind === "value-disposition" || req.kind === "resource-lifetime" || req.kind === "option-presence" || req.kind === "recipe-unhandled-value" || req.kind === "recipe-resource-without-release" || req.kind === "recipe-required-option") {
        if (typeof req.file !== "string" || req.file === "") {
            return { error: `ctx.analysis.${req.kind} needs a "file" path` };
        }
        const abs = path.resolve(root, req.file);
        if (!withinDir(abs, root)) {
            return { error: `ctx.analysis failed: file is outside the search root: ${req.file}` };
        }
        if (req.kind === "identity" || req.kind === "value-disposition" || req.kind === "resource-lifetime" || req.kind === "option-presence" || req.kind === "recipe-unhandled-value" || req.kind === "recipe-resource-without-release" || req.kind === "recipe-required-option") {
            const expression = parseExpression(req.expression);
            const query = req.kind === "identity" ? parseIdentityQuery(req.query) : req.kind === "value-disposition" ? parseDispositionQuery(req.query) : req.kind === "resource-lifetime" ? parseResourceQuery(req.query) : req.kind === "option-presence" ? parseOptionQuery(req.query) : req.kind === "recipe-unhandled-value" ? parseUnhandledRecipe(req.query) : req.kind === "recipe-resource-without-release" ? parseResourceRecipe(req.query) : parseRequiredOptionRecipe(req.query);
            if (!expression || !query)
                return { semantic: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "unsupported-expression" } };
            const model = cachedModel(abs, root, callsCache, callsAnalyzer, req.file);
            if ("error" in model)
                return { semantic: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "provider-failure" } };
            try {
                const source = fs.readFileSync(abs, "utf8");
                return { semantic: req.kind === "identity" ? identityResult(req.file, source, model.file, expression, query) : req.kind === "value-disposition" ? valueDispositionResult(req.file, source, model.file, expression, query) : req.kind === "resource-lifetime" ? resourceLifetimeResult(req.file, source, model.file, expression, query) : req.kind === "option-presence" ? optionPresenceResult(req.file, source, model.file, expression, query) : req.kind === "recipe-unhandled-value" ? unhandledValueRecipeResult(req.file, source, model.file, expression, query) : req.kind === "recipe-resource-without-release" ? resourceWithoutReleaseRecipeResult(req.file, source, model.file, expression, query) : requiredOptionRecipeResult(req.file, source, model.file, expression, query) };
            }
            catch {
                return { semantic: { version: SEMANTIC_RESULT_VERSION, status: "unknown", reason: "provider-failure" } };
            }
        }
        if (req.kind === "bindings") {
            return cachedModel(abs, root, modelCache, analyzer, req.file);
        }
        if (req.kind === "calls")
            return cachedModel(abs, root, callsCache, callsAnalyzer, req.file);
        return cachedModel(abs, root, spansCache, spansAnalyzer, req.file);
    }
    return { error: `unknown analysis kind ${JSON.stringify(req.kind)} — known kinds: available, bindings, spans, calls, identity, value-disposition, resource-lifetime, option-presence, recipe-unhandled-value, recipe-resource-without-release, recipe-required-option` };
}
function parseDispositionQuery(value) {
    if (!value || typeof value !== "object")
        return null;
    const consumers = value.consumers;
    return Array.isArray(consumers) && consumers.every(item => typeof item === "string") ? { consumers } : null;
}
function parseResourceQuery(value) { if (!value || typeof value !== 'object')
    return null; const record = value, owner = parseExpression(record.owner), release = record.release; return owner && Array.isArray(release) && release.every(item => typeof item === 'string') ? { owner, release } : null; }
function parseOptionQuery(value) { if (!value || typeof value !== "object")
    return null; const record = value; return typeof record.option === "string" && Array.isArray(record.sources) && record.sources.every(item => typeof item === "string") ? { option: record.option, sources: record.sources } : null; }
function parseUnhandledRecipe(value) { if (!value || typeof value !== "object")
    return null; const record = value, producer = record.producer, consumers = record.consumers; return producer && typeof producer.member === 'string' && Number.isInteger(producer.asyncArgument) && producer.receiver === 'array' && Array.isArray(consumers) && consumers.every(item => typeof item === 'string') ? value : null; }
function parseResourceRecipe(value) { if (!value || typeof value !== "object")
    return null; const record = value, acquisition = parseIdentityQuery(record.acquisition), owner = record.owner, ownerIdentity = parseIdentityQuery(owner === null || owner === void 0 ? void 0 : owner.identity), release = record.release; return acquisition && ownerIdentity && Number.isInteger(owner === null || owner === void 0 ? void 0 : owner.argument) && Array.isArray(release) && release.every(item => typeof item === 'string') ? value : null; }
function parseRequiredOptionRecipe(value) { if (!value || typeof value !== "object")
    return null; const record = value, call = parseIdentityQuery(record.call), option = parseOptionQuery(record.option); return call && option ? value : null; }
function parseExpression(value) {
    if (!value || typeof value !== "object")
        return null;
    const ref = value;
    return [ref.id, ref.start, ref.end].every(Number.isInteger) ? ref : null;
}
function parseIdentityQuery(value) {
    if (!value || typeof value !== "object")
        return null;
    const query = value;
    if (query.globals !== undefined && (!Array.isArray(query.globals) || !query.globals.every((item) => typeof item === "string")))
        return null;
    if (query.imports !== undefined && (!Array.isArray(query.imports) || !query.imports.every((item) => item && typeof item === "object" && typeof item.source === "string" && Array.isArray(item.names) && item.names.every((name) => typeof name === "string"))))
        return null;
    return query;
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
