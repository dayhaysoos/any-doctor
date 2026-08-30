"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFixPrompt = buildFixPrompt;
function buildFixPrompt(groups, targetDir, verifyCommand) {
    const lines = [
        "Fix the issues below that any-doctor found in this repository.",
        "",
        "For each issue: open the file at the given line, fix the problem in place,",
        "and preserve behavior. Do not reformat unrelated code.",
        "",
    ];
    for (const g of groups) {
        if (g.findings.length === 0)
            continue;
        lines.push(`## ${g.meta.id} — ${g.meta.description} (${g.findings.length} issue${g.findings.length === 1 ? "" : "s"})`);
        for (const f of g.findings.slice(0, 50)) {
            lines.push(`- ${f.file}:${f.line}${f.message ? ` — ${f.message}` : ""}`);
        }
        lines.push("");
    }
    lines.push("When you are done, check your work with exactly this command:");
    lines.push(`  ${verifyCommand}`);
    lines.push(`(run it from ${targetDir})`);
    return lines.join("\n");
}
