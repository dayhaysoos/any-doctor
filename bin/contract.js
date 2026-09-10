import * as os from "os";
import * as path from "path";
// The one severity ordering — worst first. Display rollups (report),
// derivation sorts (summary), and view-model triage (doctor tree) all
// rank through this; score weights and the gate's fail-on bar are
// different questions and keep their own tables.
export const SEVERITY_ORDER = ["error", "warning", "info"];
export function severityRank(s) {
    return SEVERITY_ORDER.indexOf(s);
}
// The default walk's extensions — the empty-scan warning names them in
// prose; composing from the array is what keeps the copy honest the day
// this list changes.
export const DEFAULT_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
// All doctors scan the same target, so the cohort's file count is any
// doctor's count; the max is the honest pick when one crashed early. The
// policy lives here, beside the RunOutcome field it fills and the Score
// that divides by it.
export function cohortFileCount(counts) {
    return counts.reduce((m, n) => Math.max(m, n), 0);
}
export const PROTOCOL_VERSION = 1;
export const RESULT_SENTINEL = "###ANY_DOCTOR_V1###";
// ctx.search host protocol: doctor children cannot spawn (permission
// model), so they ask the host to run ast-grep — request out fd 3, result
// back on stdin.
export const SEARCH_REQUEST = "###ANY_DOCTOR_SEARCH###";
export const SEARCH_RESULT = "###ANY_DOCTOR_SEARCH_RESULT###";
export function decodeSearchOp(op) {
    if (op === "pattern" || op === "rule" || op === "rules" || op === "analysis")
        return { op };
    return {
        error: `unknown search-channel op ${JSON.stringify(op)} — known ops: ${["pattern", "rule", "rules", "analysis"].join(", ")}`,
    };
}
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
// One law, in the conventions' home: test files and test directories
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
// The read-containment law, one home: a resolved path is inside its base
// when it IS the base or lies beneath it. The "-"-suffix form anchors
// mkdtemp sandboxes (any any-doctor-verify-* dir qualifies). The sdk's
// ctx.files read, certify's seed materialization, and both hosts enforce
// this same predicate — private copies are how the `..`-resolution
// subtlety gets forgotten (resolve() collapses it; a raw prefix check
// would let /target/../../etc through).
export function withinBase(root, base) {
    if (root === base)
        return true;
    if (base.endsWith("-"))
        return root.startsWith(base);
    return root.startsWith(base + path.sep);
}
// The base a mode's reads must stay within: a run's target directory, a
// verify's sandbox prefix under the temp dir, or nothing for meta (meta
// may not read at all). Pure function of the Mode — placed with it.
export function searchBase(mode) {
    switch (mode.kind) {
        case "verify": return path.join(os.tmpdir(), "any-doctor-verify-");
        case "run": return mode.root;
        case "meta": return "";
    }
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
// The fixture gate, D20: rule-aware and multiset. The key is
// rule:file:line — a wrong-rule finding at the right line is both a
// missing expectation and an unexpected finding (the gate was rule-blind
// for multi-check doctors), and two findings where one was expected leave
// one unexpected (duplicates used to collapse into one satisfied entry).
// A finding or expectation without a rule keys on "" — rule-less expected
// matches rule-less findings only.
export function compareFindings(expected, actual) {
    var _a, _b, _c;
    const key = (f) => { var _a; return JSON.stringify([(_a = f.rule) !== null && _a !== void 0 ? _a : "", f.file, f.line]); };
    const entry = (f) => ({
        ...(f.rule === undefined ? {} : { rule: f.rule }), file: f.file, line: f.line,
        ...(f.column === undefined ? {} : { column: f.column }),
    });
    const budget = new Map();
    for (const e of expected) {
        const rows = (_a = budget.get(key(e))) !== null && _a !== void 0 ? _a : [];
        rows.push({ expected: e, used: false });
        budget.set(key(e), rows);
    }
    const unexpected = [];
    for (const a of actual) {
        const rows = (_b = budget.get(key(a))) !== null && _b !== void 0 ? _b : [];
        // Consume exact columns before legacy wildcard expectations.
        const match = (_c = rows.find(r => !r.used && r.expected.column !== undefined && r.expected.column === a.column)) !== null && _c !== void 0 ? _c : rows.find(r => !r.used && r.expected.column === undefined);
        if (match)
            match.used = true;
        else
            unexpected.push(entry(a));
    }
    const missing = [...budget.values()].flatMap(rows => rows.filter(r => !r.used).map(r => entry(r.expected)));
    return { missing, unexpected };
}
// The degradation contract's one projection (D20 Stage 2): which checks
// of this doctor declared analysis needs — the ids the report names when
// it renders "narrowed", and the predicate verify uses to decide whether
// analysis-on fixtures apply.
export function narrowedCheckIds(meta) {
    var _a;
    return ((_a = meta.checks) !== null && _a !== void 0 ? _a : []).filter((c) => c.needs !== undefined && c.needs.length > 0).map((c) => c.id);
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
