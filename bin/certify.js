import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildCtx, setAnalysisDisabled, probeAnalysisAvailable } from "./sdk.js";
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
    if (abs !== tmp && !abs.startsWith(tmp + path.sep)) {
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
// The duplicate-location sensitivity probe (D24, hardened in the review
// loop): a doctor's own flag-shaped fixture — the one with the most
// expected findings concentrated in a single seeded file — is re-planted
// at three locations:
//
//   1. the original file, untouched (every fact the fixture proved);
//   2. a byte-identical twin module (the cross-file location — checks
//      whose violation is inherently cross-module must fire at both);
//   3. a pair file: the violation twice INSIDE one file, wrapped in two
//      functions (the billing.ts shape — identical chains in separate
//      functions of one module, collapsed to one finding by a dedup keyed
//      on normalized statement text).
//
// The pair file's bodies are transformed (exports stripped, imports
// hoisted) so the two in-file copies stay byte-identical TO EACH OTHER —
// which is exactly what a text-keyed dedup collapses. Assertions, counting
// only the rules the fixture expected at that file (unrelated rules cannot
// inflate a floor):
//
//   - original and twin must each independently reproduce the fixture's
//     expected count;
//   - when the witness fixture itself seeded TWO OR MORE expected findings
//     in the one file (proof the check reports per-violation, not one
//     verdict per file — openrouter's "no error check anywhere in the
//     file" is a legitimate file-scoped claim), the pair file must yield
//     at least 2x that count. Less is the collapse signature — N identical
//     violations in one file reduced to a single finding. Doctors whose
//     every fixture seeds at most one violation per file get twin+original
//     policing only; the skill tells authors to seed a two-violation
//     fixture so the probe can police same-file dedup.
function buildDuplicateLocationProbe(fixtures) {
    var _a;
    // Witness selection: the flag-shaped fixture with the most expected
    // findings in one seeded file — a 2-in-one-file witness catches per-file
    // collapse directly; any 1-file witness still exercises the twin and
    // pair locations.
    let best = null;
    for (const fixture of fixtures) {
        const perFile = new Map();
        for (const e of fixture.expected)
            perFile.set(e.file, ((_a = perFile.get(e.file)) !== null && _a !== void 0 ? _a : 0) + 1);
        for (const [file, count] of perFile) {
            if (typeof fixture.seed[file] === "string" && (best === null || count > best.count)) {
                best = { fixture, file, count };
            }
        }
    }
    if (best === null)
        return null;
    const { fixture, file: originalFile, count: expectedCount } = best;
    // Rule-less expectations (no `rule` field) can only be matched by
    // rule-less findings — key those as "" so the count filter keeps them.
    const rules = new Set(fixture.expected
        .filter((e) => e.file === originalFile)
        .map((e) => { var _a; return (_a = e.rule) !== null && _a !== void 0 ? _a : ""; }));
    const twinFile = "__probe_twin__/" + originalFile.split("/").pop();
    const pairFile = "__probe_pair__/" + originalFile.split("/").pop();
    if (typeof fixture.seed[twinFile] === "string" || typeof fixture.seed[pairFile] === "string")
        return null;
    const pairContent = pairFileContent(fixture.seed[originalFile]);
    if (pairContent === null)
        return null;
    const seed = { ...fixture.seed, [twinFile]: fixture.seed[originalFile], [pairFile]: pairContent };
    return {
        seed,
        fixtureName: fixture.name,
        analysisOff: fixture.analysis === "off",
        originalFile,
        twinFile,
        pairFile,
        expectedCount,
        rules,
    };
}
// The in-file pair: the original content twice, each copy wrapped in a
// function (module-level declarations cannot repeat, and both copies get
// the identical transform so they stay byte-equal to each other).
function pairFileContent(original) {
    const lines = original.split("\n").filter((l) => !/^\s*import\b/.test(l) && !/^\s*export\s*\{/.test(l)
        && !/^\s*export\s+type\s*\{/.test(l) && !/^\s*export\s+\*\s*from/.test(l));
    const body = lines.map((l) => l
        .replace(/^(\s*)export default (?=(?:async\s+)?(?:function|class)\b)/, "$1")
        .replace(/^(\s*)export default /, "$1const __probeDefault = ")
        .replace(/^(\s*)export (?=(?:async\s+)?(?:function|class|const|let|var|type|interface|enum|abstract|declare)\b)/, "$1")).join("\n");
    if (body.trim().length === 0)
        return null;
    const imports = original.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
    return [
        imports,
        imports ? "" : null,
        "// any-doctor duplicate-location probe — copy 1",
        "function __anyDoctorProbeA() {",
        body,
        "}",
        "// copy 2 — same violation, different location, same file",
        "function __anyDoctorProbeB() {",
        body,
        "}",
        "",
    ].filter((l) => l !== null).join("\n");
}
// The certification entry point: every policy, in gate order, as result
// rows a verify frame can carry.
export async function certify(mod, fixtures) {
    var _a;
    validateClaimContract(mod);
    const results = [];
    // Only a doctor whose checks declare analysis needs can have
    // analysis-on sandboxes — probing anyone else would make a channel-less
    // direct invocation fail fixtures that never touch analysis at all.
    const declaresNeeds = contract.narrowedCheckIds(mod.meta).length > 0;
    let analysisAvailable;
    for (const fixture of fixtures) {
        try {
            // The fixture's declared analysis mode: "off" forces the degraded
            // path (pinning the narrowed behavior); the default "on" runs with
            // the engine — and skips honestly when it is not installed here,
            // rather than failing a fixture whose expectations belong to the
            // full-power path.
            setAnalysisDisabled(fixture.analysis === "off");
            if (declaresNeeds && fixture.analysis !== "off" && analysisAvailable === undefined) {
                analysisAvailable = await inSandbox({}, async (tmp) => probeAnalysisAvailable(tmp));
            }
            if (declaresNeeds && fixture.analysis !== "off" && analysisAvailable === false) {
                results.push(skipRow(fixture.name));
                continue;
            }
            // Verify always lists everything (includeTestsFor): the sandbox is
            // the doctor's own world — a seed named *.test.ts is deliberate
            // test data (effect-v4-doctor's sleep-in-test depends on it).
            const result = await inSandbox(fixture.seed, (tmp) => runOnce(tmp, mod, { includeTests: true }));
            const diff = contract.compareFindings(fixture.expected, result.findings);
            results.push({ name: fixture.name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff });
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
    // The duplicate-location sensitivity probe (D24).
    const probe = buildDuplicateLocationProbe(fixtures);
    if (probe !== null) {
        const name = `duplicate-location sensitivity (from "${probe.fixtureName}")`;
        if (declaresNeeds && !probe.analysisOff && analysisAvailable === false) {
            results.push(skipRow(name));
        }
        else {
            try {
                setAnalysisDisabled(probe.analysisOff);
                const findings = await inSandbox(probe.seed, (tmp) => runOnce(tmp, mod, { includeTests: true }))
                    .then((r) => r.findings);
                const at = (file) => findings.filter((f) => { var _a; return f.file === file && probe.rules.has((_a = f.rule) !== null && _a !== void 0 ? _a : ""); }).length;
                const problems = [];
                if (at(probe.originalFile) < probe.expectedCount) {
                    problems.push(`the untouched original no longer produces its ${probe.expectedCount} finding(s) — got ${at(probe.originalFile)}`);
                }
                if (at(probe.twinFile) < probe.expectedCount) {
                    problems.push(`the byte-identical twin module produces ${at(probe.twinFile)} finding(s) where ${probe.expectedCount} expected — a dedup keyed on statement text collapses distinct violations sharing a body`);
                }
                if (probe.expectedCount >= 2 && at(probe.pairFile) > 0 && at(probe.pairFile) < probe.expectedCount * 2) {
                    problems.push(`the same violation planted twice in ONE file yields ${at(probe.pairFile)} finding(s) — the collapse signature (N identical violations reduced to one; the billing.ts bug class)`);
                }
                results.push(problems.length === 0
                    ? okRow(name)
                    : { ...errorRow(name, problems.join("; ")), missing: [], unexpected: [] });
            }
            catch (e) {
                results.push(errorRow(name, e));
            }
            finally {
                setAnalysisDisabled(false);
            }
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
                results.push({ ...errorRow(name, e), error: "unreadable expect.json: " + (e instanceof Error ? e.message : String(e)) });
                continue;
            }
            const expected = (_a = manifest === null || manifest === void 0 ? void 0 : manifest.expect) === null || _a === void 0 ? void 0 : _a[String(mod.meta.id)];
            if (!Array.isArray(expected))
                continue;
            try {
                const seed = {};
                collectSeed(caseDir, "", seed, "expect.json");
                if (declaresNeeds && analysisAvailable === undefined) {
                    analysisAvailable = await inSandbox({}, async (tmp) => probeAnalysisAvailable(tmp));
                }
                if (declaresNeeds && analysisAvailable === false) {
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
