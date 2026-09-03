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
exports.globalDoctorsDir = globalDoctorsDir;
exports.findRepoDoctorsDir = findRepoDoctorsDir;
exports.readMeta = readMeta;
exports.discoverDoctors = discoverDoctors;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const contract_1 = require("./contract");
function globalDoctorsDir() {
    return path.join(os.homedir(), ".any-doctor", "doctors");
}
function findRepoDoctorsDir(cwd) {
    let dir = path.resolve(cwd);
    for (;;) {
        const candidate = path.join(dir, "doctors");
        if (fs.existsSync(candidate))
            return candidate;
        const parent = path.dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
}
function loaderPath() {
    return path.join(__dirname, "doctor-loader.mjs");
}
function readMeta(doctorPath) {
    const r = (0, child_process_1.spawnSync)(process.execPath, [loaderPath(), doctorPath, "--meta"], {
        encoding: "utf8",
        timeout: 30000,
    });
    const idx = r.stdout.split("\n").findLastIndex(l => l.startsWith(contract_1.RESULT_SENTINEL));
    if (r.status !== 0 || idx === -1) {
        const detail = (r.stderr || r.stdout || "loader exited " + r.status).trim().split("\n").slice(-2).join(" | ");
        return { meta: null, error: detail };
    }
    const parsed = JSON.parse(r.stdout.split("\n")[idx].slice(contract_1.RESULT_SENTINEL.length));
    return { meta: parsed.meta };
}
function discoverDoctors(cwd, opts) {
    var _a;
    const repoDir = findRepoDoctorsDir(cwd);
    const scopes = [
        ...(repoDir ? [{ scope: "repo", dir: repoDir }] : []),
        { scope: "global", dir: (_a = opts === null || opts === void 0 ? void 0 : opts.globalDir) !== null && _a !== void 0 ? _a : globalDoctorsDir() },
    ];
    const bySlug = new Map();
    for (const { scope, dir } of scopes) {
        if (!fs.existsSync(dir))
            continue;
        const files = fs.readdirSync(dir)
            .filter(f => (f.endsWith(".mjs") || f.endsWith(".js")) && !/\.fixtures\.(m|c)?js$/.test(f))
            .sort();
        for (const f of files) {
            const slug = f.replace(/\.(m|c)?js$/, "");
            if (bySlug.has(slug))
                continue;
            const abs = path.join(dir, f);
            const { meta, error } = readMeta(abs);
            bySlug.set(slug, { slug, scope, path: abs, meta, error });
        }
    }
    return [...bySlug.values()];
}
