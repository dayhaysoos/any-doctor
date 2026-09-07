import * as fs from "fs";
import * as path from "path";
import { isTestPath, SEARCH_REQUEST, SEARCH_RESULT } from "./contract.js";
const DEFAULT_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
// Production posture (D18): ctx.files.list() excludes test paths — tests
// mimic production shapes without being production reads. The law itself
// (isTestPath) and the run/verify derivation live in contract.ts; a run
// opts back in with --include-tests. ctx.files.read() is never filtered:
// an explicit path is a doctor's deliberate choice.
export function buildCtx(root, opts = {}) {
    const findings = [];
    function walk(dir, exts, out) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith("."))
                continue;
            const abs = path.join(dir, entry.name);
            const rel = path.relative(root, abs);
            // One predicate for files and directories: a test directory prunes
            // the whole subtree; a test-named file is skipped alone.
            if (!opts.includeTests && isTestPath(rel))
                continue;
            if (entry.isDirectory())
                walk(abs, exts, out);
            else if (exts.has(path.extname(entry.name)))
                out.push(rel);
        }
    }
    const ctx = {
        root,
        files: {
            list(exts) {
                const extSet = new Set((exts && exts.length ? exts : DEFAULT_EXTS)
                    .map(e => (e.startsWith(".") ? e : "." + e)));
                const out = [];
                walk(root, extSet, out);
                return out.sort();
            },
            read(relativePath) {
                const abs = path.resolve(root, relativePath);
                if (abs !== root && !abs.startsWith(root + path.sep)) {
                    throw new Error(`ctx.files.read escapes the repo root: ${relativePath}`);
                }
                return fs.readFileSync(abs, "utf8");
            },
        },
        search: {
            pattern(pattern, language = "TypeScript") {
                return runSearch(pattern, language, root);
            },
        },
        report: {
            finding(f) {
                findings.push(f);
            },
        },
    };
    return { ctx, getFindings: () => findings.slice() };
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function runSearch(pattern, language, root) {
    var _a;
    let response;
    try {
        fs.writeSync(3, SEARCH_REQUEST + JSON.stringify({ pattern, language, root }) + "\n");
        response = readSearchResponse();
    }
    catch (e) {
        throw new Error(`ctx.search is unavailable — no search host on this channel (${e instanceof Error ? e.message : String(e)}). `
            + "Doctors run through any-doctor; a bare doctor-loader.mjs invocation has no host.");
    }
    if (response.error !== undefined)
        throw new Error(response.error);
    return toMatches((_a = response.matches) !== null && _a !== void 0 ? _a : [], root);
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
function toMatches(raw, root) {
    return raw.map(m => {
        var _a, _b, _c, _d, _e, _f;
        return ({
            file: (m.file || "").replace(new RegExp("^" + escapeRegExp(root) + "/"), ""),
            line: ((_c = (_b = (_a = m.range) === null || _a === void 0 ? void 0 : _a.start) === null || _b === void 0 ? void 0 : _b.line) !== null && _c !== void 0 ? _c : 0) + 1,
            column: ((_f = (_e = (_d = m.range) === null || _d === void 0 ? void 0 : _d.start) === null || _e === void 0 ? void 0 : _e.column) !== null && _f !== void 0 ? _f : 1),
            text: m.text || "",
        });
    });
}
