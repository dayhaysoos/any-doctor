const WEIGHTS = { error: 10, warning: 4, info: 1 };
export function findingSeverity(g, f) {
    var _a, _b;
    if (f.severity)
        return f.severity;
    const check = f.rule ? (_a = g.meta.checks) === null || _a === void 0 ? void 0 : _a.find(c => c.id === f.rule) : undefined;
    return (_b = check === null || check === void 0 ? void 0 : check.severity) !== null && _b !== void 0 ? _b : g.meta.severity;
}
export function scoreFromSeverities(sevs) {
    let score = 100;
    for (const s of sevs)
        score -= WEIGHTS[s];
    score = Math.max(0, Math.min(100, score));
    let grade = "Critical";
    if (score >= 90)
        grade = "Excellent";
    else if (score >= 75)
        grade = "Good";
    else if (score >= 50)
        grade = "Fair";
    else if (score >= 25)
        grade = "Poor";
    return { score, grade };
}
export function computeScore(groups) {
    let score = 100;
    for (const g of groups) {
        for (const f of g.findings) {
            score -= WEIGHTS[findingSeverity(g, f)];
        }
    }
    score = Math.max(0, Math.min(100, score));
    let grade = "Critical";
    if (score >= 90)
        grade = "Excellent";
    else if (score >= 75)
        grade = "Good";
    else if (score >= 50)
        grade = "Fair";
    else if (score >= 25)
        grade = "Poor";
    return { score, grade };
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
