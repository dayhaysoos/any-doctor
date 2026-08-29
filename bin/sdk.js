"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCtx = buildCtx;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DEFAULT_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
function buildCtx(root) {
    const findings = [];
    function walk(dir, exts, out) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith("."))
                continue;
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory())
                walk(abs, exts, out);
            else if (exts.has(path.extname(entry.name)))
                out.push(path.relative(root, abs));
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
                return fs.readFileSync(path.join(root, relativePath), "utf8");
            },
        },
        search: {
            pattern(pattern, language = "TypeScript") {
                const r = (0, child_process_1.spawnSync)("sg", ["run", "-p", pattern, "-l", language, "--json", root], {
                    encoding: "utf8",
                    timeout: 120000,
                });
                if (r.error && r.error.code === "ENOENT") {
                    throw new Error("ctx.search requires ast-grep (sg) on PATH — install: brew install ast-grep");
                }
                if (r.status !== 0 && !r.stdout.trim()) {
                    throw new Error("ctx.search failed: " + (r.stderr || "sg exited " + r.status));
                }
                let raw = [];
                try {
                    raw = JSON.parse(r.stdout);
                }
                catch {
                    throw new Error(`ctx.search produced unparseable output from sg — refusing to report a false green. First bytes: ${JSON.stringify(r.stdout.slice(0, 120))}`);
                }
                return raw.map(m => {
                    var _a, _b, _c, _d, _e, _f;
                    return ({
                        file: (m.file || "").replace(new RegExp("^" + escapeRegExp(root) + "/"), ""),
                        line: ((_c = (_b = (_a = m.range) === null || _a === void 0 ? void 0 : _a.start) === null || _b === void 0 ? void 0 : _b.line) !== null && _c !== void 0 ? _c : 0) + 1,
                        column: (_f = (_e = (_d = m.range) === null || _d === void 0 ? void 0 : _d.start) === null || _e === void 0 ? void 0 : _e.column) !== null && _f !== void 0 ? _f : 1,
                        text: m.text || "",
                    });
                });
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
