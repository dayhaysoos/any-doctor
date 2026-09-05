export const PROTOCOL_VERSION = 1;
export const RESULT_SENTINEL = "###ANY_DOCTOR_V1###";
// Filename conventions of the doctor contract — the one home for what is a
// doctor file, what is a fixture file, and where a doctor's fixtures live.
export const DOCTOR_FILE_RE = /\.(m|c)?js$/;
export const FIXTURES_FILE_RE = /\.fixtures\.(m|c)?js$/;
export function fixturesPathFor(programPath) {
    return programPath.replace(DOCTOR_FILE_RE, "") + ".fixtures.mjs";
}
// The re-run command embedded in copied issue context. invoker defaults to
// the installed binary name; callers running via node or npx pass their own.
export function runCommandFor(doctorFile, root, invoker = "any-doctor") {
    return `${invoker} run "${doctorFile}" "${root}"`;
}
export function compareFindings(expected, actual) {
    const key = (f) => `${f.file}:${f.line}`;
    const expectedKeys = new Set(expected.map(key));
    const actualKeys = new Set(actual.map(key));
    const missing = expected.filter(f => !actualKeys.has(key(f))).map(f => ({ file: f.file, line: f.line }));
    const unexpected = actual.filter(f => !expectedKeys.has(key(f))).map(f => ({ file: f.file, line: f.line }));
    return { missing, unexpected };
}
export function resolveFinding(meta, finding) {
    var _a, _b, _c, _d, _e, _f, _g;
    const checkId = (_a = finding.rule) !== null && _a !== void 0 ? _a : meta.id;
    const check = (_b = meta.checks) === null || _b === void 0 ? void 0 : _b.find(c => c.id === checkId);
    return {
        doctorId: meta.id,
        checkId,
        checkKey: meta.id + "/" + checkId,
        description: (_c = check === null || check === void 0 ? void 0 : check.description) !== null && _c !== void 0 ? _c : meta.description,
        severity: (_e = (_d = finding.severity) !== null && _d !== void 0 ? _d : check === null || check === void 0 ? void 0 : check.severity) !== null && _e !== void 0 ? _e : meta.severity,
        declaredSeverity: (_f = check === null || check === void 0 ? void 0 : check.severity) !== null && _f !== void 0 ? _f : meta.severity,
        category: (_g = meta.category) !== null && _g !== void 0 ? _g : "general",
        impact: check === null || check === void 0 ? void 0 : check.impact,
        why: check === null || check === void 0 ? void 0 : check.why,
        fix: check === null || check === void 0 ? void 0 : check.fix,
        blindSpots: meta.blindSpots,
        finding,
    };
}
