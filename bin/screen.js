"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Screen = void 0;
const SYNC_BEGIN = "\x1b[?2026h";
const SYNC_END = "\x1b[?2026l";
const ALT_ENTER = "\x1b[?1049h";
const ALT_EXIT = "\x1b[?1049l";
class Screen {
    constructor(out) {
        this.out = out;
        this.prev = null;
        this.usedAlt = false;
    }
    render(lines) {
        var _a, _b, _c;
        const out = [];
        if (this.prev === null) {
            out.push(ALT_ENTER, "\x1b[H", "\x1b[2J");
        }
        out.push(SYNC_BEGIN, "\x1b[H");
        const max = Math.max((_b = (_a = this.prev) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0, lines.length);
        for (let i = 0; i < max; i++) {
            const current = (_c = lines[i]) !== null && _c !== void 0 ? _c : "";
            if (this.prev && this.prev[i] === current)
                continue;
            out.push(`\x1b[${i + 1};1H\x1b[2K` + current);
        }
        out.push("\x1b[J", SYNC_END);
        this.prev = lines;
        this.out.write(out.join(""));
    }
    exit() {
        if (this.usedAlt)
            this.out.write(ALT_EXIT);
        this.prev = null;
    }
}
exports.Screen = Screen;
