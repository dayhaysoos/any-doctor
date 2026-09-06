import { resolveFinding } from "./contract.js";
const WEIGHTS = { error: 10, warning: 4, info: 1 };
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
export function scoreFromSeverities(sevs) {
    let score = 100;
    for (const s of sevs)
        score -= WEIGHTS[s];
    score = Math.max(0, Math.min(100, score));
    return { score, grade: gradeFor(score) };
}
export function computeScore(groups) {
    return scoreFromSeverities(groups.flatMap(g => g.findings.map(f => findingSeverity(g, f))));
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
