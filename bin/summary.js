import { narrowedCheckIds, resolveFinding } from "./contract.js";
import { categoryRollup, computeScore, findingSeverity, scoreHeaderLines } from "./score.js";
// The Summary: the one derivation from a RunOutcome to everything its
// surfaces render — the report string and the dashboard tree today, a
// JSON adapter when the CI chapter arrives. Before this module, the
// derivation existed twice (renderReport and the dashboard each
// re-deduped, re-scored, and re-rolled up the same findings), and the
// facts a machine consumer needs — severity counts, the hidden-duplicate
// count, per-check rollups, narrowed ids — were locked inside rendering,
// nowhere as data. One derivation, N adapters: the "surfaces agree"
// invariant moved from a test into a module.
//
// Pure: derive twice from one RunOutcome, get one Summary. Rendering
// (colors, prose, trees) belongs to the adapters, never here.
// Worst-first display order — one home; the report's rollup rendering
// imports it rather than re-listing severities.
export const SEVERITY_ORDER = ["error", "warning", "info"];
function groupSeverity(g) {
    var _a;
    const explicit = g.findings.find(f => f.severity);
    return (_a = (explicit ? findingSeverity(g, explicit) : undefined)) !== null && _a !== void 0 ? _a : g.meta.severity;
}
// A site claimed by one doctor is hidden when ANOTHER doctor claims it
// too (same location, different doctor — one display copy). A second
// check from the SAME doctor at the same site is a different diagnosis
// of one line (filter-table-scan and unbounded-collect on one chain)
// and survives — the check tree exists to show each check's own story.
function dedupeGroups(groups) {
    const owner = new Map();
    const key = (f) => `${f.file}:${f.line}`;
    const ordered = [...groups].sort((a, b) => SEVERITY_ORDER.indexOf(groupSeverity(a)) - SEVERITY_ORDER.indexOf(groupSeverity(b)));
    const out = [];
    let hidden = 0;
    for (const g of ordered) {
        if (g.findings.length === 0) {
            out.push(g);
            continue;
        }
        const kept = [];
        for (const f of g.findings) {
            const k = key(f);
            const heldBy = owner.get(k);
            if (heldBy === undefined) {
                owner.set(k, g.meta.id);
                kept.push(f);
            }
            else if (heldBy !== g.meta.id) {
                hidden++;
            }
            else {
                kept.push(f);
            }
        }
        if (kept.length > 0)
            out.push({ ...g, findings: kept });
    }
    return { groups: out, hidden };
}
export function deriveSummary(outcome) {
    const { groups, hidden } = dedupeGroups(outcome.groups);
    const total = groups.reduce((n, g) => n + g.findings.length, 0);
    const score = computeScore(groups, outcome.fileCount);
    const header = scoreHeaderLines(score);
    const severityCounts = { error: 0, warning: 0, info: 0 };
    for (const g of groups) {
        for (const f of g.findings)
            severityCounts[findingSeverity(g, f)]++;
    }
    const groupChecks = groups.map(g => ({ group: g, checks: expandChecks(g), narrowedIds: outcome.analysisAvailable === false ? narrowedCheckIds(g.meta) : [] }));
    return {
        groups,
        groupChecks,
        total,
        hidden,
        score,
        header,
        severityCounts,
        categories: categoryRollup(groups),
        emptyScan: outcome.fileCount === 0 && total === 0,
    };
}
function expandChecks(g) {
    var _a;
    const buckets = new Map();
    for (const f of g.findings) {
        const j = resolveFinding(g.meta, f);
        if (!buckets.has(j.checkKey)) {
            buckets.set(j.checkKey, {
                ruleId: (_a = f.rule) !== null && _a !== void 0 ? _a : null,
                heading: j.description,
                severity: j.declaredSeverity,
                findings: [],
            });
        }
        buckets.get(j.checkKey).findings.push(f);
    }
    return [...buckets.values()];
}
