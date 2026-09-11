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
// Exported for the dashboard's per-doctor scores: each doctor's findings
// against the same denominator the repo-wide score uses.
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
    // Floor, never round: any finding must cost at least a point, or a
    // 1-error-in-200-files scan would render a perfect 100 above its own
    // finding list — the anchor (zero findings = 100) stays true. Clamped
    // at 0 because findings may name files outside the scanned count (a
    // doctor can read and report a non-default extension).
    const score = filesTotal <= 0
        ? 100
        : Math.max(0, Math.min(100, Math.floor(100 * (1 - burden / filesTotal))));
    return { score, grade: gradeFor(score), filesClean: Math.max(0, filesTotal - worst.size), filesTotal, emptyScan: filesTotal <= 0 };
}
export function computeScore(groups, filesTotal) {
    return scoreFromFileHealth(groups.flatMap(g => g.findings.map(f => ({ file: f.file, severity: findingSeverity(g, f) }))), filesTotal);
}
// The empty-scan predicate's one home: every surface that decides
// anything by "nothing was scanned" — the header composer, the tone in
// palette, the dashboard's row — asks this, so the policy cannot drift
// into a fifth inline `filesTotal === 0`.
export function isEmptyScan(s) {
    return s.filesTotal === 0;
}
// The one composer for the score's header lines (D19): report and
// dashboard render these strings, never re-compose them. The clean line
// is null for an empty scan — there is nothing to be clean against —
// and so is any score claim: "100 — Excellent" over nothing checked is
// a false green, so the header says n/a instead. A PARTIAL scan (doctors
// crashed) gets the same refusal: findings stay listed and the exit
// stays failing, but the aggregate grade is withheld — the crashed
// doctors' silence must never read as cleanliness.
export function scoreHeaderLines(s) {
    if (isEmptyScan(s)) {
        return { scoreLine: "Score: n/a — no files scanned", cleanLine: null, emptyScan: true, partialScan: false };
    }
    if (s.partialScan === true) {
        return { scoreLine: "Score: n/a — partial scan (a doctor failed — crashed or broken; results above are incomplete)", cleanLine: null, emptyScan: false, partialScan: true };
    }
    return {
        scoreLine: `Score: ${s.score} / 100 — ${s.grade}`,
        cleanLine: `${s.filesClean}/${s.filesTotal} files clean`,
        emptyScan: false,
        partialScan: false,
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
