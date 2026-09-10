import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildCtx, setAnalysisDisabled, probeAnalysisAvailable } from "./sdk.js";
import { withinBase } from "./contract.js";
import * as contract from "./contract.js";
// One execution of a doctor program against a root, framed as a run result.
// Owned here because both halves need it: the loader's run mode and every
// certification sandbox. Typed, not Record<string, unknown> — consumers
// (certify, the loader frame) read .findings and .meta off it directly.
export async function runOnce(root, mod, opts) {
    const started = Date.now();
    const { ctx, getFindings } = buildCtx(root, opts);
    const fileCount = ctx.files.list().length;
    const result = mod.doctor(ctx);
    if (!result || typeof result.then !== "function") {
        throw new Error("doctor() must be async — declare it `export async function doctor(ctx)`");
    }
    return result.then(() => ({
        protocolVersion: contract.PROTOCOL_VERSION,
        kind: "run",
        root,
        fileCount,
        durationMs: Date.now() - started,
        meta: mod.meta,
        findings: getFindings(),
    }));
}
// The claim contract (D23): certification requires each declared check to
// state the observable condition it establishes, its innocent lookalikes,
// and - when it needs the identity engine - what happens on unknown. Prose
// impact is not a testable claim. Thrown before any sandbox runs; the
// loader renders the problems and exits 3.
export class ClaimContractViolation extends Error {
    constructor(problems) {
        super("claim contract violations:\n  " + problems.join("\n  "));
        this.problems = problems;
        this.name = "ClaimContractViolation";
    }
}
export function validateClaimContract(mod) {
    var _a;
    const checks = (_a = mod.meta) === null || _a === void 0 ? void 0 : _a.checks;
    if (!Array.isArray(checks))
        return;
    const problems = [];
    for (const c of checks) {
        if (typeof c.claim !== "string" || c.claim.trim().length === 0) {
            problems.push(`check "${String(c.id)}": claim is required — one sentence, the observable condition detected, not the consequence`);
        }
        if (!Array.isArray(c.lookalikes) || c.lookalikes.length === 0) {
            problems.push(`check "${String(c.id)}": lookalikes is required — at least one innocent shape that must stay silent`);
        }
        if (c.reportingUnit !== undefined && !["occurrence", "file", "project"].includes(String(c.reportingUnit))) {
            problems.push(`check "${String(c.id)}": reportingUnit must be occurrence, file, or project`);
        }
        if (Array.isArray(c.needs) && c.needs.length > 0
            && (c.onUnknown !== "narrow" && c.onUnknown !== "skip")) {
            problems.push(`check "${String(c.id)}": onUnknown is required when needs is declared — "narrow" or "skip"`);
        }
    }
    if (problems.length > 0)
        throw new ClaimContractViolation(problems);
}
const SKIP_ANALYSIS = "analysis engine unavailable — pins the analysis-on path";
// The result-row constructors: every policy speaks in the same row shape,
// so a verify frame's consumers never see policy-specific spellings.
const okRow = (name) => ({ name, ok: true, missing: [], unexpected: [] });
const skipRow = (name) => ({ ...okRow(name), skipped: SKIP_ANALYSIS });
const errorRow = (name, e) => ({
    name, ok: false, missing: [], unexpected: [],
    error: e instanceof Error ? e.message : String(e),
});
function materializeSeed(tmp, rel, content) {
    const abs = path.resolve(tmp, rel);
    if (!withinBase(abs, tmp)) {
        throw new Error(`fixture seed path escapes the sandbox: ${rel}`);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
}
// The one sandbox lifecycle: materialize a seed into a fresh temp dir, run,
// clean up. A crashing sandbox is a named failing result (or the caller's
// error row) — siblings always run.
async function inSandbox(seed, run) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-verify-"));
    try {
        for (const [rel, content] of Object.entries(seed))
            materializeSeed(tmp, rel, content);
        return await run(tmp);
    }
    finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}
// The one corpus walker: a directory tree as a seed map. `skip` carves out
// manifest files (the sensitivity corpus's expect.json).
function collectSeed(dir, prefix, seed, skip) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = prefix ? prefix + "/" + entry.name : entry.name;
        if (entry.isDirectory())
            collectSeed(abs, rel, seed, skip);
        else if (entry.name !== skip)
            seed[rel] = fs.readFileSync(abs, "utf8");
    }
}
// doctor-reliability's witness law as one named predicate: an occurrence
// check needs two distinct positions of that check in one file. A line-only
// expectation overlaps every column on its line, so it counts once no
// matter how many column-exact siblings share the line (D28's overlap fix).
function distinctLocationsInFile(hits) {
    var _a, _b;
    const files = new Map();
    for (const hit of hits) {
        const lines = (_a = files.get(hit.file)) !== null && _a !== void 0 ? _a : new Map();
        const columns = (_b = lines.get(hit.line)) !== null && _b !== void 0 ? _b : new Set();
        columns.add(hit.column);
        lines.set(hit.line, columns);
        files.set(hit.file, lines);
    }
    return [...files.values()].some((lines) => [...lines.values()]
        .reduce((count, columns) => count + (columns.has(undefined) ? 1 : columns.size), 0) >= 2);
}
// The certification entry point: every policy, in gate order, as result
// rows a verify frame can carry.
export async function certify(mod, fixtures) {
    var _a, _b, _c, _d;
    validateClaimContract(mod);
    const results = [];
    // Only a doctor whose checks declare analysis needs can have
    // analysis-on sandboxes — probing anyone else would make a channel-less
    // direct invocation fail fixtures that never touch analysis at all.
    const declaresNeeds = contract.narrowedCheckIds(mod.meta).length > 0;
    let analysisAvailable;
    // The fixture loop's own rows, keyed by fixture — the location-coverage
    // witness asks "did THIS fixture pass", never "which row is this index".
    const rowByFixture = new Map();
    // The one skip policy (D25): an analysis-on sandbox whose engine is not
    // installed here is an honest skip, not a failure — expectations belong
    // to the full-power path. One decision for every policy that asks.
    const skipFor = async (analysisOn) => {
        if (!declaresNeeds || !analysisOn)
            return false;
        if (analysisAvailable === undefined) {
            analysisAvailable = await inSandbox({}, async (tmp) => probeAnalysisAvailable(tmp));
        }
        return analysisAvailable === false;
    };
    for (const fixture of fixtures) {
        try {
            // The fixture's declared analysis mode: "off" forces the degraded
            // path (pinning the narrowed behavior); the default "on" runs with
            // the engine — and skips honestly when it is not installed here,
            // rather than failing a fixture whose expectations belong to the
            // full-power path.
            setAnalysisDisabled(fixture.analysis === "off");
            if (await skipFor(fixture.analysis !== "off")) {
                results.push(skipRow(fixture.name));
                continue;
            }
            // Verify always lists everything (includeTestsFor): the sandbox is
            // the doctor's own world — a seed named *.test.ts is deliberate
            // test data (effect-v4-doctor's sleep-in-test depends on it).
            const result = await inSandbox(fixture.seed, (tmp) => runOnce(tmp, mod, { includeTests: true }));
            const diff = contract.compareFindings(fixture.expected, result.findings);
            const row = { name: fixture.name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff };
            results.push(row);
            rowByFixture.set(fixture, row);
        }
        catch (e) {
            results.push(errorRow(fixture.name, e));
        }
        finally {
            setAnalysisDisabled(false);
        }
    }
    // The shared innocent corpus (D23): files that look guilty but aren't —
    // the audit counterexamples as commons. Every doctor runs against them
    // with expected: []; a finding here is a false positive by definition,
    // whoever wrote the check.
    const innocentDir = corpusDir("innocent");
    if (innocentDir !== null) {
        const seed = {};
        collectSeed(innocentDir, "", seed);
        try {
            const diff = await inSandbox(seed, (tmp) => runOnce(tmp, mod, { includeTests: true }))
                .then((r) => contract.compareFindings([], r.findings));
            results.push({
                name: "shared innocent corpus (" + Object.keys(seed).length + " files)",
                ok: diff.missing.length === 0 && diff.unexpected.length === 0,
                ...diff,
            });
        }
        catch (e) {
            results.push(errorRow("shared innocent corpus", e));
        }
    }
    // Explicit, context-preserving witnesses per check replace source rewriting.
    // One sibling's fixture cannot establish another check's location coverage.
    for (const check of (_a = mod.meta.checks) !== null && _a !== void 0 ? _a : []) {
        const name = `location coverage: ${check.id}`;
        if (!check.reportingUnit) {
            results.push({ ...okRow(name), skipped: "reporting unit undeclared — location coverage not exercised" });
            continue;
        }
        if (((_b = check.needs) === null || _b === void 0 ? void 0 : _b.length) && await skipFor(true)) {
            results.push(skipRow(name));
            continue;
        }
        const witness = fixtures.find((fixture) => {
            const row = rowByFixture.get(fixture);
            if (row === undefined || !row.ok || row.skipped !== undefined)
                return false;
            if (check.needs !== undefined && check.needs.length > 0 && fixture.analysis === "off")
                return false;
            const hits = fixture.expected.filter(f => f.rule === check.id);
            if (check.reportingUnit !== "occurrence")
                return hits.length > 0;
            return distinctLocationsInFile(hits);
        });
        if (witness)
            results.push(okRow(name));
        else {
            const reason = check.reportingUnit === "occurrence"
                ? "requires a passing fixture with two distinct locations of this check in one file"
                : "requires a passing positive fixture for this check";
            const severity = (_c = check.severity) !== null && _c !== void 0 ? _c : mod.meta.severity;
            results.push(severity === "info" ? { ...okRow(name), skipped: reason } : errorRow(name, reason));
        }
    }
    // The sensitivity corpus (D24): the innocent corpus's complement —
    // confirmed-real patterns from the audits, patterns that MUST produce
    // findings. Each case directory carries its seed files plus an expect.json
    // mapping doctor id -> expected findings; a doctor only runs the cases it
    // has stakes in.
    const sensDir = corpusDir("sensitivity");
    if (sensDir !== null) {
        for (const entry of fs.readdirSync(sensDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (!entry.isDirectory())
                continue;
            const caseDir = path.join(sensDir, entry.name);
            const expectPath = path.join(caseDir, "expect.json");
            if (!fs.existsSync(expectPath))
                continue;
            const name = `sensitivity: ${entry.name}`;
            let manifest;
            try {
                manifest = JSON.parse(fs.readFileSync(expectPath, "utf8"));
            }
            catch (e) {
                results.push({ ...okRow(name), ok: false, error: "unreadable expect.json: " + (e instanceof Error ? e.message : String(e)) });
                continue;
            }
            const expected = (_d = manifest === null || manifest === void 0 ? void 0 : manifest.expect) === null || _d === void 0 ? void 0 : _d[String(mod.meta.id)];
            if (!Array.isArray(expected))
                continue;
            try {
                const seed = {};
                collectSeed(caseDir, "", seed, "expect.json");
                if (await skipFor(true)) {
                    results.push(skipRow(name));
                    continue;
                }
                const diff = await inSandbox(seed, (tmp) => runOnce(tmp, mod, { includeTests: true }))
                    .then((r) => contract.compareFindings(expected, r.findings));
                results.push({ name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff });
            }
            catch (e) {
                results.push(errorRow(name, e));
            }
        }
    }
    return results;
}
// A shipped corpus directory, resolved next to the compiled module (bin/'s
// sibling fixtures/), or null when absent — an unbundled checkout still
// certifies, just without the commons. ANY_DOCTOR_CORPUS_ROOT is the test
// seam: tests point the harness at their own corpus trees instead of
// planting synthetic stakes in the shipped commons.
function corpusDir(name) {
    const override = process.env.ANY_DOCTOR_CORPUS_ROOT;
    if (override !== undefined && override !== "") {
        const dir = path.join(path.resolve(override), name);
        return fs.existsSync(dir) ? dir : null;
    }
    try {
        const dir = fs.realpathSync(new URL("../fixtures/" + name, import.meta.url));
        return fs.existsSync(dir) ? dir : null;
    }
    catch {
        return null;
    }
}
