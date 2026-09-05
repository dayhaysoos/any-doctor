import { spawnSync } from "child_process";
export function copyToClipboard(text) {
    const bins = [["pbcopy", []], ["wl-copy", []], ["clip", []]];
    for (const [bin, args] of bins) {
        const r = spawnSync(bin, args, { input: text, encoding: "utf8" });
        if (r.status === 0)
            return true;
    }
    return false;
}
