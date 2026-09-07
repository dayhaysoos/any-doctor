import { resolveFinding } from "./contract.js";
// A file's burden by its worst finding: an error makes the file fully
// sick, a warning half, info barely. The score is the share of the scan
// that carries no findings at all — one sentence a user can verify by
// counting files: "491/628 files clean" is a 78.
const FILE_BURDEN = { error: 1, warning: 0.5, info: 0.1 };
const SEVERITY_ORDER = { info: 0, warning: 1, error: 2 };
export function findingSeverity(g, f) {
    return resolveFinding(g.meta, f).severity;
}
export function gradeFor(score) {
    if (score >= 90)
        return "Excellent";
    if (score >= 75)
        return "Good";
    if (score >= 50)
        return "Fair";
    if (score >= 25)
        return "Poor";
    return "Critical";
}
export function scoreFromFileHealth(perFile, filesTotal) {
    const worst = new Map();
    for (const { file, severity } of perFile) {
        const cur = worst.get(file);
        if (cur === undefined || SEVERITY_ORDER[severity] > SEVERITY_ORDER[cur])
            worst.set(file, severity);
    }
    let burden = 0;
    for (const s of worst.values())
        burden += FILE_BURDEN[s];
    const score = filesTotal <= 0
        ? 100
        : Math.max(0, Math.min(100, Math.round(100 * (1 - burden / filesTotal))));
    return { score, grade: gradeFor(score), filesClean: Math.max(0, filesTotal - worst.size), filesTotal };
}
export function computeScore(groups, filesTotal) {
    return scoreFromFileHealth(groups.flatMap(g => g.findings.map(f => ({ file: f.file, severity: findingSeverity(g, f) }))), filesTotal);
}
// The one composer for the score's header lines (D19): report and
// dashboard render these strings, never re-compose them. The clean line
// is null for an empty scan — there is nothing to be clean against.
export function scoreHeaderLines(s) {
    return {
        scoreLine: `Score: ${s.score} / 100 — ${s.grade}`,
        cleanLine: s.filesTotal > 0 ? `${s.filesClean}/${s.filesTotal} files clean` : null,
    };
}
export function categoryRollup(groups) {
    var _a;
    const map = new Map();
    for (const g of groups) {
        const category = (_a = g.meta.category) !== null && _a !== void 0 ? _a : "general";
        if (!map.has(category))
            map.set(category, { error: 0, warning: 0, info: 0 });
        for (const f of g.findings) {
            map.get(category)[findingSeverity(g, f)]++;
        }
    }
    return [...map.entries()].map(([category, counts]) => ({ category, counts }));
}
