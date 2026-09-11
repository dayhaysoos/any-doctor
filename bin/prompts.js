import { summarizeCheck } from "./doctor-tree.js";
// Task prompts: the text the dashboard copies to the clipboard as a unit of
// work for the user's own agent — one finding, every finding of one check,
// or one doctor's whole batch. Enter copies the selected finding; `c` copies
// at whatever level the selection rests on; the bulk prompt is the natural
// agent task: "fix this pattern everywhere it appears."
//
// The prompts are pure functions of the Doctor tree's view-model types plus
// the verify command — no TUI, no clipboard, no I/O — so they test and
// evolve (M2's investigation-first rework lands here) without a terminal.
// The unconditional fix framing is scheduled copy work, deliberately
// unchanged by the extraction that moved it.
function promptHeading(severity, description, checkKey) {
    return `${severity.toUpperCase()} · ${description} (${checkKey})`;
}
function scopeTail(scopeLine, verifyCommand, plural = false, decideCommand) {
    const lines = [
        "",
        "Scope:",
        scopeLine,
        "- Investigate first; fix the root cause when the finding is real.",
        "- If it is intentional or misread for this code, record a decision instead — never silence or disable the check itself.",
        "- Keep unrelated refactors out of this pass.",
    ];
    if (decideCommand !== undefined) {
        lines.push(`- Record the decision with: \`${decideCommand}\``);
    }
    lines.push("", `Verify with \`${verifyCommand}\` and confirm the finding${plural ? "s are" : " is"} gone before moving on.`);
    return lines;
}
export function fixPrompt(item, verifyCommand, decideCommand) {
    const site = item.site;
    const lines = [
        "Fix exactly one any-doctor finding:",
        "",
        promptHeading(item.severity, item.description, item.checkKey),
        "",
        `Affected site: ${site.file}:${site.line}`,
    ];
    if (item.impact)
        lines.push("", "Impact " + item.impact);
    if (item.why)
        lines.push("", "Why " + item.why);
    if (item.fix)
        lines.push("", "Suggested fix: " + item.fix);
    lines.push(...scopeTail(`- Fix only ${item.checkKey} at this site.`, verifyCommand, false, decideCommand));
    return lines.join("\n");
}
// The re-scan loop is the pagination for display; a copied task still
// lists generously, then defers the remainder to the next run.
const PROMPT_SITES_CAP = 100;
function sitesOf(items, cap) {
    const shown = items.slice(0, cap);
    return {
        lines: shown.map(i => `- ${i.site.file}:${i.site.line}`),
        hidden: items.length - shown.length,
    };
}
function pushSites(lines, sites) {
    lines.push(...sites.lines);
    if (sites.hidden > 0) {
        lines.push(`- … and ${sites.hidden} more — fix this batch, then re-run for the rest`);
    }
}
export function checkFixPrompt(items, verifyCommand) {
    const check = summarizeCheck(items[0].checkKey, items);
    const lines = [
        "Fix every finding of one any-doctor check:",
        "",
        promptHeading(check.severity, check.description, check.checkKey),
        "",
        `${check.count} finding${check.count === 1 ? "" : "s"} across ${check.files} file${check.files === 1 ? "" : "s"}:`,
    ];
    pushSites(lines, sitesOf(items, PROMPT_SITES_CAP));
    if (check.impact)
        lines.push("", "Impact " + check.impact);
    if (check.why)
        lines.push("", "Why " + check.why);
    if (check.fix)
        lines.push("", "Suggested fix: " + check.fix);
    lines.push(...scopeTail(`- Fix ${check.checkKey} at every listed site — as many as practical in one pass.`, verifyCommand, true));
    return lines.join("\n");
}
// Doctor prompts list generously per check but not boundlessly; the
// re-run note carries the remainder.
const DOCTOR_PROMPT_SITES_PER_CHECK = 25;
export function doctorFixPrompt(doc, group, verifyCommand) {
    var _a;
    const lines = [
        "Fix the findings of one any-doctor program:",
        "",
        `${doc.worst.toUpperCase()} · ${doc.doctorId} — ${doc.count} finding${doc.count === 1 ? "" : "s"} across ${doc.files} file${doc.files === 1 ? "" : "s"}`,
    ];
    for (const g of (_a = group === null || group === void 0 ? void 0 : group.checks) !== null && _a !== void 0 ? _a : []) {
        {
            const summary = summarizeCheck(g.checkKey, g.items);
            lines.push("", `${summary.severity.toUpperCase()} · ${summary.description} (${summary.checkKey}) — ${summary.count} finding${summary.count === 1 ? "" : "s"}`);
            if (summary.why)
                lines.push("Why " + summary.why);
            if (summary.fix)
                lines.push("Suggested fix: " + summary.fix);
            pushSites(lines, sitesOf(g.items, DOCTOR_PROMPT_SITES_PER_CHECK));
        }
    }
    lines.push(...scopeTail(`- Fix every check of ${doc.doctorId} at the listed sites — as many as practical in one pass.`, verifyCommand, true));
    return lines.join("\n");
}
