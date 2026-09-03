"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyToClipboard = copyToClipboard;
const child_process_1 = require("child_process");
function copyToClipboard(text) {
    const bins = [["pbcopy", []], ["wl-copy", []], ["clip", []]];
    for (const [bin, args] of bins) {
        const r = (0, child_process_1.spawnSync)(bin, args, { input: text, encoding: "utf8" });
        if (r.status === 0)
            return true;
    }
    return false;
}
