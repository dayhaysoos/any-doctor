import * as path from "path";
import { decodeSearchOp, includeTestsFor, isTestPath, SEARCH_REQUEST, searchBase, withinBase } from "./contract.js";
import { runEngine } from "./engine.js";
import { handleAnalysisRequest } from "./analysis-host.js";
// One request line in, one response body out (the SEARCH_RESULT sentinel
// is framing added by the transport in the runner). Returns null for lines
// that are not requests. The op discriminator selects the engine query
// shape and now decodes through the contract's one home — an unknown op
// is a loud error, never a silent pattern search. Analysis requests route
// to the sibling analysis host.
export function handleSearchLine(line, mode, engine = runEngine) {
    var _a, _b, _c, _d;
    if (!line.startsWith(SEARCH_REQUEST))
        return null;
    let req;
    try {
        req = JSON.parse(line.slice(SEARCH_REQUEST.length));
    }
    catch {
        return JSON.stringify({ error: "ctx.search failed: malformed host request" });
    }
    const base = searchBase(mode);
    // resolve() collapses `..` and anchors relatives — a prefix check on the
    // raw string would let /target/../../etc through.
    const root = typeof req.root === "string" ? path.resolve(req.root) : "";
    if (base === "" || !withinBase(root, base)) {
        return JSON.stringify({ error: "ctx.search failed: search root is outside the allowed target" });
    }
    const decoded = decodeSearchOp((_a = req.op) !== null && _a !== void 0 ? _a : "pattern");
    if ("error" in decoded)
        return JSON.stringify({ error: decoded.error });
    if (decoded.op === "analysis") {
        return JSON.stringify(handleAnalysisRequest({ kind: req.kind, file: req.file, root: req.root }, mode));
    }
    const language = typeof req.language === "string" ? req.language : "TypeScript";
    const query = decoded.op === "rule"
        ? { op: decoded.op, rule: ((_b = req.rule) !== null && _b !== void 0 ? _b : {}) }
        : decoded.op === "rules"
            ? { op: decoded.op, rules: ((_c = req.rules) !== null && _c !== void 0 ? _c : []) }
            : { op: decoded.op, pattern: String((_d = req.pattern) !== null && _d !== void 0 ? _d : "") };
    const r = engine(query, language, root);
    if (!r.ok)
        return JSON.stringify({ error: r.error });
    const matches = includeTestsFor(mode) ? r.matches : r.matches.filter((m) => !isTestPath(matchRel(root, m)));
    return JSON.stringify({ matches });
}
// Engine paths arrive root-prefixed or already root-relative; either way
// the predicate answers on the path relative to the search root. A match
// with no file is unclassifiable and stays.
function matchRel(root, m) {
    var _a;
    const f = (_a = m.file) !== null && _a !== void 0 ? _a : "";
    return f.startsWith(root + path.sep) ? f.slice(root.length + 1) : f;
}
