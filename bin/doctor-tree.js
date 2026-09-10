import { resolveFinding } from "./contract.js";
import { scoreFromFileHealth } from "./score.js";
export function buildItems(groups) {
    const items = [];
    for (const g of groups) {
        for (const f of g.findings) {
            const j = resolveFinding(g.meta, f);
            items.push({ ...j, readKey: j.checkKey + "@" + f.file + ":" + f.line, site: f });
        }
    }
    return items;
}
// The re-scan loop is the pagination: a check shows its first N findings,
// then an affordance to fix a few and run again.
export const FINDINGS_PER_CHECK = 50;
const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };
export function buildTree(items, filesTotal) {
    var _a;
    const byDoctor = new Map();
    for (const it of items) {
        let checks = byDoctor.get(it.doctorId);
        if (!checks) {
            checks = new Map();
            byDoctor.set(it.doctorId, checks);
        }
        const group = (_a = checks.get(it.checkKey)) !== null && _a !== void 0 ? _a : [];
        group.push(it);
        checks.set(it.checkKey, group);
    }
    const doctors = [...byDoctor.entries()].map(([doctorId, checks]) => {
        const entries = [...checks.entries()].map(([checkKey, list]) => ({
            checkKey,
            items: [...list].sort((a, b) => a.site.file === b.site.file
                ? a.site.line - b.site.line
                : a.site.file < b.site.file ? -1 : 1),
        })).sort((a, b) => {
            const sa = SEVERITY_RANK[a.items[0].declaredSeverity];
            const sb = SEVERITY_RANK[b.items[0].declaredSeverity];
            return sa !== sb ? sa - sb : b.items.length - a.items.length || (a.checkKey < b.checkKey ? -1 : 1);
        });
        return {
            doctorId,
            checks: entries,
            multiCheck: entries.length > 1,
            count: entries.reduce((n, g) => n + g.items.length, 0),
            worst: entries.reduce((w, g) => (SEVERITY_RANK[g.items[0].severity] < SEVERITY_RANK[w] ? g.items[0].severity : w), "info"),
            score: scoreFromFileHealth(entries.flatMap(g => g.items.map(it => ({ file: it.site.file, severity: it.severity }))), filesTotal),
        };
    });
    // Triage order: worst severity first, then most findings, then name.
    return doctors.sort((a, b) => SEVERITY_RANK[a.worst] - SEVERITY_RANK[b.worst]
        || b.count - a.count
        || (a.doctorId < b.doctorId ? -1 : 1));
}
export function summarizeCheck(checkKey, groupItems) {
    const first = groupItems[0];
    const files = new Set(groupItems.map(i => i.site.file));
    return {
        checkKey,
        checkId: first.checkId,
        doctorId: first.doctorId,
        description: first.description,
        severity: first.declaredSeverity,
        impact: first.impact,
        why: first.why,
        fix: first.fix,
        blindSpots: first.blindSpots,
        count: groupItems.length,
        files: files.size,
    };
}
export function summarizeDoctor(d) {
    var _a;
    const first = (_a = d.checks[0]) === null || _a === void 0 ? void 0 : _a.items[0];
    const files = new Set();
    for (const g of d.checks)
        for (const i of g.items)
            files.add(i.site.file);
    return {
        doctorId: d.doctorId,
        description: first ? first.description : d.doctorId,
        worst: d.worst,
        count: d.count,
        files: files.size,
        score: d.score,
        checks: d.checks.map(g => ({
            description: g.items[0].description,
            severity: g.items[0].declaredSeverity,
            count: g.items.length,
        })),
        blindSpots: first === null || first === void 0 ? void 0 : first.blindSpots,
    };
}
// Errors open on entry: any doctor carrying error findings, any
// error-severity check, and the top of the list so the first screen is
// never an empty overview. Everything else starts collapsed.
export function initialExpanded(tree) {
    const expanded = new Set();
    const multiDoctor = tree.length > 1;
    tree.forEach((d, i) => {
        if (multiDoctor && (d.worst === "error" || i === 0))
            expanded.add(d.doctorId);
        if (!d.multiCheck)
            return;
        for (const g of d.checks) {
            if (g.items[0].declaredSeverity === "error")
                expanded.add(g.checkKey);
        }
    });
    return expanded;
}
