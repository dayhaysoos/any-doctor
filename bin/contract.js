export const PROTOCOL_VERSION = 1;
export const RESULT_SENTINEL = "###ANY_DOCTOR_V1###";
// ctx.search host protocol: doctor children cannot spawn (permission
// model), so they ask the host to run ast-grep — request out fd 3, result
// back on stdin.
export const SEARCH_REQUEST = "###ANY_DOCTOR_SEARCH###";
export const SEARCH_RESULT = "###ANY_DOCTOR_SEARCH_RESULT###";
export function modeArgs(mode, programPath) {
    switch (mode.kind) {
        case "run": return mode.includeTests === true
            ? [programPath, mode.root, "--include-tests"]
            : [programPath, mode.root];
        case "verify": return [programPath, "--verify", mode.fixtures];
        case "meta": return [programPath, "--meta"];
    }
}
export function decodeLoaderArgs(argv) {
    const [program, second, third] = argv;
    if (!program || program.startsWith("-"))
        return null;
    if (second === "--verify" && third !== undefined)
        return { program, mode: { kind: "verify", fixtures: third } };
    if (second === "--meta" && third === undefined)
        return { program, mode: { kind: "meta" } };
    if (second !== undefined && !second.startsWith("-") && (third === undefined || third === "--include-tests")) {
        return { program, mode: { kind: "run", root: second, ...(third === "--include-tests" ? { includeTests: true } : {}) } };
    }
    return null;
}
// Filename conventions of the doctor contract — the one home for what is a
// doctor file, what is a fixture file, and where a doctor's fixtures live.
export const DOCTOR_FILE_RE = /\.(m|c)?js$/;
export const FIXTURES_FILE_RE = /\.fixtures\.(m|c)?js$/;
// A check id is a short kebab-case noun phrase naming the defect, unique within its doctor,
// over the charset [a-z0-9-] (never "/" — checkKey joins ids with it).
// Prefer naming the defect ("uncleared-settimeout-in-effect") over the
// pattern it searches for.
export function fixturesPathFor(programPath) {
    return programPath.replace(DOCTOR_FILE_RE, "") + ".fixtures.mjs";
}
// D18's one law, in the conventions' home: test files and test directories
// are not production reads. Every read capability applies this predicate —
// the sdk walk prunes by it, the search host filters matches by it. Test
// FILES are test-named code files (.test./.spec. with a code extension);
// test DIRECTORIES are test/tests/__tests__ anywhere in the path.
const TEST_FILE_RE = /(?:\.test|\.spec)\.[cm]?[jt]sx?$/i;
const TEST_DIR_NAMES = new Set(["test", "tests", "__tests__"]);
export function isTestPath(relativePath) {
    if (TEST_FILE_RE.test(relativePath))
        return true;
    return relativePath.split(/[\\/]+/).some((seg) => TEST_DIR_NAMES.has(seg));
}
// One derivation, one home: a run scans test files only when --include-tests
// asks; a verify always sees everything its fixtures seed (D18) — the
// sandbox is the doctor's own world.
export function includeTestsFor(mode) {
    if (mode.kind === "verify")
        return true;
    return mode.kind === "run" && mode.includeTests === true;
}
// The re-run command embedded in copied prompts. invoker defaults to
// the installed binary name; callers running via node or npx pass their own.
export function runCommandFor(doctorPath, root, invoker = "any-doctor") {
    return `${invoker} run "${doctorPath}" "${root}"`;
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
