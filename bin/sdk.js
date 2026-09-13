import { createHash } from "node:crypto";
import { inventory } from "./file-scope.js";
import * as fs from "fs";
import * as path from "path";
import { SEARCH_REQUEST, SEARCH_RESULT, withinDir } from "./contract.js";
import { maskNonCode } from "./mask.js";
// The verify harness forces the degraded path per fixture (fixture
// `analysis: "off"`): the loader flips this switch before running that
// fixture's sandbox, and every ctx in the child answers accordingly.
// Nothing else can disable analysis — a run never narrows silently.
let analysisForcedOff = false;
export function setAnalysisDisabled(disabled) {
    analysisForcedOff = disabled;
}
// The loader's skip probe: would a ctx built now see the analysis engine?
// One channel question, cached by the verify loop. A channel-less direct
// loader invocation answers false — no host means no analysis, which is
// the honest answer for a narrowing decision (bindings() still fails
// loudly on a missing channel, exactly like ctx.search).
export function probeAnalysisAvailable(root) {
    if (analysisForcedOff)
        return false;
    try {
        return Boolean(runAnalysis({ kind: "available" }, root).available);
    }
    catch {
        return false;
    }
}
// Production posture (D18): ctx.files.list() excludes test paths — tests
// mimic production shapes without being production reads. The law itself
// (isTestPath) and the run/verify derivation live in contract.ts; a run
// opts back in with --include-tests. ctx.files.read() is never filtered:
// an explicit path is a doctor's deliberate choice.
export function buildCtx(root, opts = {}) {
    const findings = [];
    const sourceCache = new Map();
    const digest = (source) => createHash("sha256").update(source).digest("hex");
    function readSource(file) {
        let source = sourceCache.get(file);
        if (source === undefined) {
            source = readFileWithin(root, file);
            sourceCache.set(file, source);
        }
        return source;
    }
    let availabilityCache;
    let project;
    let fileInventory;
    // The one per-kind fetch with the one guard: availability check (the
    // loud failure names the kind and the needs declaration), channel call,
    // structural unwrap. bindings/spans/calls differ only in kind.
    const analysisFile = (kind, file) => {
        var _a;
        if (analysisForcedOff || !ctx.analysis.available) {
            throw new Error(`ctx.analysis.${kind} requires the analysis engine and it is unavailable`
                + " — check ctx.analysis.available, and declare the check's needs in meta so the report shows the narrowing.");
        }
        const r = runAnalysis({ kind, file, sourceDigest: digest(readSource(file)) }, root);
        if (r.file === undefined || !(kind in r.file))
            throw new Error((_a = r.error) !== null && _a !== void 0 ? _a : "ctx.analysis failed");
        return r.file;
    };
    const ctx = {
        root,
        files: {
            list(exts) {
                return inventory(root, exts).files.filter(f => f.role !== "generated" && (opts.includeTests || f.role !== "test")).map(f => f.file).sort();
            },
            inventory() {
                return fileInventory !== null && fileInventory !== void 0 ? fileInventory : (fileInventory = inventory(root, [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts", ".cjs"]));
            },
            read(relativePath) {
                return readSource(relativePath);
            },
            readMasked(relativePath) {
                return maskNonCode(readSource(relativePath));
            },
        },
        search: {
            pattern(pattern, language = "TypeScript") {
                return runSearch({ op: "pattern", pattern }, language, root, opts.includeTests);
            },
            rule(query, language = "TypeScript") {
                return runSearch({ op: "rule", rule: validateRuleQuery(query) }, language, root, opts.includeTests);
            },
            rules(queries, language = "TypeScript") {
                return runSearch({ op: "rules", rules: validateNamedRuleQueries(queries) }, language, root, opts.includeTests);
            },
        },
        analysis: {
            consumers(file) {
                var _a;
                if (!ctx.analysis.available)
                    throw new Error("consumer analysis unavailable");
                if (!project) {
                    const response = runAnalysis({ kind: "project" }, root);
                    if (!response.project)
                        throw new Error((_a = response.error) !== null && _a !== void 0 ? _a : "consumer analysis failed");
                    project = response.project;
                    for (const [file, source] of sourceCache)
                        if (project.coverage.sourceDigests[file] && digest(source) !== project.coverage.sourceDigests[file])
                            throw new Error(`source changed during consumer analysis: ${file}`);
                }
                if (!(file in project.files))
                    throw new Error(`consumer analysis outside captured inventory: ${file}`);
                return { exports: project.files[file], coverage: project.coverage };
            },
            structures(file) {
                var _a;
                if (!ctx.analysis.available)
                    throw new Error("function structure analysis unavailable");
                const response = runAnalysis({ kind: "structures", file, sourceDigest: digest(readSource(file)) }, root);
                if (!response.structures)
                    throw new Error((_a = response.error) !== null && _a !== void 0 ? _a : "function structure analysis failed");
                return response.structures;
            },
            // One channel question, cached per ctx — availability is cheap and
            // honest data, never a guess. The verify harness's forced-off
            // switch (fixture `analysis: "off"`) overrides a present engine so
            // the degraded path is pinnable anywhere.
            get available() {
                if (availabilityCache === undefined) {
                    // No host channel → no analysis: the honest answer for a
                    // narrowing decision, not a crash (bindings() is the loud path).
                    try {
                        availabilityCache = Boolean(runAnalysis({ kind: "available" }, root).available);
                    }
                    catch {
                        availabilityCache = false;
                    }
                }
                return availabilityCache && !analysisForcedOff;
            },
            bindings(file) {
                return analysisFile("bindings", file);
            },
            spans(file) {
                return analysisFile("spans", file);
            },
            calls(file) {
                return analysisFile("calls", file);
            },
        },
        report: {
            finding(f) {
                findings.push(f);
            },
        },
    };
    return { ctx, getFindings: () => findings.slice(), getAnalysisCoverage: () => {
            if (project) {
                const files = inventory(root, [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts", ".cjs", ".json"]).files;
                if (JSON.stringify(files) !== JSON.stringify(project.coverage.inventory.files))
                    throw new Error("source inventory changed during consumer analysis");
                for (const [file, expected] of Object.entries(project.coverage.sourceDigests))
                    if (digest(readFileWithin(root, file)) !== expected)
                        throw new Error(`source changed during consumer analysis: ${file}`);
            }
            return project === null || project === void 0 ? void 0 : project.coverage;
        } };
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// The one read with one guard: an explicit path is a doctor's deliberate
// choice (never test-path filtered), but it must stay inside the repo —
// both read and readMasked pass through here, through the strict
// containment form (withinDir in contract.ts; no mktemp anchor carve-out
// — a repo root is a directory, not a prefix).
function readFileWithin(root, relativePath) {
    const abs = path.resolve(root, relativePath);
    if (!withinDir(abs, root)) {
        throw new Error(`ctx.files read escapes the repo root: ${relativePath}`);
    }
    if (!withinDir(fs.realpathSync(abs), fs.realpathSync(root)))
        throw new Error(`ctx.files read escapes the repo root: ${relativePath}`);
    return fs.readFileSync(abs, "utf8");
}
// Rule queries are curated (D20 Stage 1): pattern + inside, nothing else.
// Validation runs BEFORE the host is asked, and errors teach — an agent
// that misspells a key gets the allowed list and the nearest match, not
// a rule that silently matches nothing (the repair log's silent-schema
// lesson, refused at the seam this time).
const RULE_KEYS = ["pattern", "inside"];
const INSIDE_KEYS = ["pattern", "stopBy"];
function validateRuleQuery(query) {
    if (typeof query !== "object" || query === null || Array.isArray(query)) {
        throw new Error('ctx.search.rule needs a query object: { pattern, inside? }');
    }
    const record = query;
    for (const key of Object.keys(record)) {
        if (!RULE_KEYS.includes(key)) {
            throw new Error(`ctx.search.rule: unknown key "${key}"${didYouMean(key, RULE_KEYS)} — allowed: ${RULE_KEYS.join(", ")}`);
        }
    }
    const pattern = record.pattern;
    if (typeof pattern !== "string" || pattern === "") {
        throw new Error('ctx.search.rule needs a "pattern" string (the structural pattern to match)');
    }
    const out = { pattern };
    const inside = record.inside;
    if (inside !== undefined) {
        if (typeof inside !== "object" || inside === null || Array.isArray(inside)) {
            throw new Error('ctx.search.rule: "inside" must be an object: { pattern, stopBy? }');
        }
        for (const key of Object.keys(inside)) {
            if (!INSIDE_KEYS.includes(key)) {
                throw new Error(`ctx.search.rule: unknown key "${key}" inside "inside"${didYouMean(key, INSIDE_KEYS)} — allowed: ${INSIDE_KEYS.join(", ")}`);
            }
        }
        const inner = inside;
        if (typeof inner.pattern !== "string" || inner.pattern === "") {
            throw new Error('ctx.search.rule: "inside" needs a "pattern" string (the enclosing construct)');
        }
        if (inner.stopBy !== undefined && inner.stopBy !== "end" && inner.stopBy !== "neighbor") {
            throw new Error(`ctx.search.rule: "inside.stopBy" must be "end" or "neighbor" — got ${JSON.stringify(inner.stopBy)} (default is "end")`);
        }
        out.inside = { pattern: inner.pattern, ...(inner.stopBy !== undefined ? { stopBy: inner.stopBy } : {}) };
    }
    return out;
}
function didYouMean(got, allowed) {
    const near = allowed.find((a) => a.includes(got) || got.includes(a) || levenshtein(got, a) <= 2);
    return near && near !== got ? ` — did you mean "${near}"?` : "";
}
// The multi-rule batch: same curation as a single rule, plus ids —
// unique, non-empty strings, because every match comes back tagged with
// the id of the rule that found it.
function validateNamedRuleQueries(queries) {
    if (!Array.isArray(queries) || queries.length === 0) {
        throw new Error("ctx.search.rules needs a non-empty array of named rules: [{ id, pattern, inside? }]");
    }
    const seen = new Set();
    return queries.map((q) => {
        if (typeof q !== "object" || q === null) {
            throw new Error('ctx.search.rules: each rule must be an object { id, pattern, inside? }');
        }
        const record = q;
        for (const key of Object.keys(record)) {
            if (!["id", ...RULE_KEYS].includes(key)) {
                throw new Error(`ctx.search.rules: unknown key "${key}"${didYouMean(key, RULE_KEYS)} — allowed: id, ${RULE_KEYS.join(", ")}`);
            }
        }
        if (typeof record.id !== "string" || record.id === "") {
            throw new Error('ctx.search.rules: every rule needs an "id" string — matches come back tagged with it');
        }
        if (seen.has(record.id)) {
            throw new Error(`ctx.search.rules: duplicate id "${record.id}" — ids must be unique`);
        }
        seen.add(record.id);
        const validated = validateRuleQuery({ pattern: record.pattern, ...(record.inside !== undefined ? { inside: record.inside } : {}) });
        return { id: record.id, ...validated };
    });
}
function levenshtein(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const tmp = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return row[b.length];
}
function runSearch(query, language, root, includeTests) {
    var _a;
    let response;
    try {
        const body = query.op === "rule"
            ? { op: query.op, rule: query.rule, language, root, includeTests }
            : query.op === "rules"
                ? { op: query.op, rules: query.rules, language, root, includeTests }
                : { op: query.op, pattern: query.pattern, language, root, includeTests };
        fs.writeSync(3, SEARCH_REQUEST + JSON.stringify(body) + "\n");
        response = readSearchResponse();
    }
    catch (e) {
        throw new Error(`ctx.search is unavailable — no search host on this channel (${e instanceof Error ? e.message : String(e)}). `
            + "Doctors run through any-doctor; a bare doctor-loader.mjs invocation has no host.");
    }
    if (response.error !== undefined) {
        const detail = query.op === "rule"
            ? `${response.error}\nquery: ${JSON.stringify(query.rule)}`
            : query.op === "rules"
                ? `${response.error}\nrules: ${JSON.stringify(query.rules.map((r) => r.id))}`
                : response.error;
        throw new Error(detail);
    }
    return toMatches((_a = response.matches) !== null && _a !== void 0 ? _a : [], root);
}
function runAnalysis(body, root) {
    let response;
    try {
        fs.writeSync(3, SEARCH_REQUEST + JSON.stringify({ op: "analysis", ...body, root }) + "\n");
        response = readSearchResponse();
    }
    catch (e) {
        throw new Error(`ctx.analysis is unavailable — no host on this channel (${e instanceof Error ? e.message : String(e)}). `
            + "Doctors run through any-doctor; a bare doctor-loader.mjs invocation has no host.");
    }
    return response;
}
function readSearchResponse() {
    const chunk = Buffer.alloc(65536);
    let buffer = "";
    for (;;) {
        const n = fs.readSync(0, chunk, 0, chunk.length, null);
        if (n === 0)
            throw new Error("search host channel closed");
        buffer += chunk.toString("utf8", 0, n);
        const nl = buffer.indexOf("\n");
        if (nl !== -1) {
            const line = buffer.slice(0, nl);
            if (line.startsWith(SEARCH_RESULT)) {
                return JSON.parse(line.slice(SEARCH_RESULT.length));
            }
            buffer = buffer.slice(nl + 1);
        }
    }
}
// The engine's raw match becomes the doctor's Match: extent and captures
// kept, sigils stripped ($$$ARGS arrives as captures.ARGS — an array for
// multi-metavariables, a single Capture otherwise). Lines are 1-based;
// columns pass through as the engine reports them, as they always have.
function toMatches(raw, root, includeTests) {
    return raw.map(m => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const captures = capturesOf(m);
        return {
            file: (m.file || "").replace(new RegExp("^" + escapeRegExp(root) + "/"), ""),
            line: ((_c = (_b = (_a = m.range) === null || _a === void 0 ? void 0 : _a.start) === null || _b === void 0 ? void 0 : _b.line) !== null && _c !== void 0 ? _c : 0) + 1,
            column: ((_f = (_e = (_d = m.range) === null || _d === void 0 ? void 0 : _d.start) === null || _e === void 0 ? void 0 : _e.column) !== null && _f !== void 0 ? _f : 1),
            text: m.text || "",
            ...(m.ruleId !== undefined ? { ruleId: m.ruleId } : {}),
            ...(((_g = m.range) === null || _g === void 0 ? void 0 : _g.end) !== undefined ? { endLine: ((_h = m.range.end.line) !== null && _h !== void 0 ? _h : 0) + 1, endColumn: (_j = m.range.end.column) !== null && _j !== void 0 ? _j : 0 } : {}),
            ...(captures !== undefined ? { captures } : {}),
        };
    });
}
function capturesOf(m) {
    var _a, _b;
    const single = (_a = m.metaVariables) === null || _a === void 0 ? void 0 : _a.single;
    const multi = (_b = m.metaVariables) === null || _b === void 0 ? void 0 : _b.multi;
    if (single === undefined && multi === undefined)
        return undefined;
    const out = {};
    for (const [key, capture] of Object.entries(single !== null && single !== void 0 ? single : {})) {
        out[key.replace(/^\$+/, "")] = toCapture(capture);
    }
    for (const [key, captures] of Object.entries(multi !== null && multi !== void 0 ? multi : {})) {
        // ast-grep's multi-captures include separator tokens (`","` between
        // arguments) as their own captures — dialect noise the seam absorbs:
        // a multi-capture array is the captured NODES, never the commas.
        out[key.replace(/^\$+/, "")] = (captures !== null && captures !== void 0 ? captures : [])
            .filter((c) => { var _a; return ((_a = c.text) !== null && _a !== void 0 ? _a : "").trim() !== ","; })
            .map(toCapture);
    }
    return out;
}
function toCapture(c) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    return {
        text: (_a = c.text) !== null && _a !== void 0 ? _a : "",
        line: ((_d = (_c = (_b = c.range) === null || _b === void 0 ? void 0 : _b.start) === null || _c === void 0 ? void 0 : _c.line) !== null && _d !== void 0 ? _d : 0) + 1,
        column: (_g = (_f = (_e = c.range) === null || _e === void 0 ? void 0 : _e.start) === null || _f === void 0 ? void 0 : _f.column) !== null && _g !== void 0 ? _g : 0,
        endLine: ((_k = (_j = (_h = c.range) === null || _h === void 0 ? void 0 : _h.end) === null || _j === void 0 ? void 0 : _j.line) !== null && _k !== void 0 ? _k : 0) + 1,
        endColumn: (_o = (_m = (_l = c.range) === null || _l === void 0 ? void 0 : _l.end) === null || _m === void 0 ? void 0 : _m.column) !== null && _o !== void 0 ? _o : 0,
    };
}
