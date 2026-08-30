"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeScore = computeScore;
exports.categoryRollup = categoryRollup;
const WEIGHTS = { error: 10, warning: 4, info: 1 };
function computeScore(groups) {
    var _a;
    let score = 100;
    for (const g of groups) {
        for (const f of g.findings) {
            score -= WEIGHTS[(_a = f.severity) !== null && _a !== void 0 ? _a : g.meta.severity];
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
function categoryRollup(groups) {
    var _a, _b;
    const map = new Map();
    for (const g of groups) {
        const category = (_a = g.meta.category) !== null && _a !== void 0 ? _a : "general";
        if (!map.has(category))
            map.set(category, { error: 0, warning: 0, info: 0 });
        for (const f of g.findings) {
            map.get(category)[(_b = f.severity) !== null && _b !== void 0 ? _b : g.meta.severity]++;
        }
    }
    return [...map.entries()].map(([category, counts]) => ({ category, counts }));
}
