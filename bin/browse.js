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
exports.browseFindings = browseFindings;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m", INVERSE = "\x1b[7m";
const GLYPH = { error: "✖", warning: "⚠", info: "ℹ" };
const COLOR = { error: RED, warning: YELLOW, info: CYAN };
async function browseFindings(input, useColor) {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY || !stdout.isTTY || input.findings.length === 0)
        return;
    const c = (s, wrap) => (useColor && wrap ? wrap + s + RESET : s);
    let selected = 0;
    const contextFor = (f) => {
        const out = [];
        try {
            const lines = fs.readFileSync(path.join(input.root, f.file), "utf8").split("\n");
            const from = Math.max(0, f.line - 3);
            const to = Math.min(lines.length, f.line + 2);
            for (let i = from; i < to; i++) {
                const marker = i === f.line - 1 ? c(">", RED) : " ";
                const num = c(String(i + 1).padStart(4), DIM);
                out.push(`${marker} ${num} │ ${lines[i]}`);
            }
        }
        catch {
            out.push(c("  (source unavailable)", DIM));
        }
        return out;
    };
    const draw = () => {
        var _a;
        const rows = stdout.rows || 24;
        const listHeight = Math.max(3, rows - 8);
        let offset = Math.max(0, Math.min(selected - listHeight + 1, input.findings.length - listHeight));
        offset = Math.min(offset, selected);
        const frame = ["\x1b[H\x1b[2J"];
        frame.push(c(`${input.description}  (${input.findings.length} findings)`, BOLD));
        frame.push("");
        for (let i = offset; i < Math.min(offset + listHeight, input.findings.length); i++) {
            const f = input.findings[i];
            const sev = (_a = f.severity) !== null && _a !== void 0 ? _a : input.severity;
            const line = `${c(GLYPH[sev], COLOR[sev])} ${f.file}:${f.line}`;
            frame.push(i === selected ? c(line, INVERSE) : line);
        }
        if (input.findings.length > listHeight) {
            frame.push(c(`  (${selected + 1}/${input.findings.length})`, DIM));
        }
        frame.push("");
        const f = input.findings[selected];
        if (f.message)
            frame.push(c(f.message, DIM));
        frame.push(...contextFor(f));
        frame.push("");
        frame.push(c("↑↓ move · enter next · q quit", DIM));
        stdout.write(frame.join("\n"));
    };
    return new Promise((resolve) => {
        const wasRaw = stdin.isRaw;
        stdin.setRawMode(true);
        stdin.resume();
        stdout.write("\x1b[?25l");
        draw();
        const onData = (buf) => {
            const s = buf.toString("utf8");
            if (s === "q" || s === "\x03" || s === "\x1b")
                return cleanup();
            if (s === "\x1b[A" || s === "k")
                selected = Math.max(0, selected - 1);
            else if (s === "\x1b[B" || s === "j" || s === "\r" || s === "\n")
                selected = Math.min(input.findings.length - 1, selected + 1);
            else
                return;
            draw();
        };
        const cleanup = () => {
            stdin.removeListener("data", onData);
            if (stdin.isRaw !== undefined && wasRaw !== undefined)
                stdin.setRawMode(wasRaw);
            stdout.write("\x1b[?25h");
            resolve();
        };
        stdin.on("data", onData);
    });
}
