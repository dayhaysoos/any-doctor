import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildCtx, setAnalysisDisabled, probeAnalysisAvailable } from "./sdk.js";
import * as contract from "./contract.js";
// One execution of a doctor program against a root, framed as a run result.
// Owned here because both halves need it: the loader's run mode and every
// certification sandbox.
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
// The duplicate-location sensitivity probe (D24): a doctor's own
// flag-shaped fixture — one with expected findings — is re-planted with
// the same violation at a SECOND location: a byte-identical twin module
// of the flagged file. No text is transformed (stripping exports or
// wrapping bodies would change what text-keyed checks see), so both
// locations carry exactly the violation the fixture proved. A dedup
// keyed on normalized statement text — the billing.ts bug, three
// identical chains collapsed to one finding — cannot produce findings
// at both locations and fails here, deterministically, before any audit.
// The assertion is a FLOOR (at least 2× the expected count across the
// two locations), not equality: checks that flag duplication itself may
// honestly report the twin, and over-reporting is compareFindings'
// jurisdiction in the per-fixture gate, not this probe's.
function buildDuplicateLocationProbe(fixture) {
    var _a;
    const perFile = new Map();
    for (const e of fixture.expected)
        perFile.set(e.file, ((_a = perFile.get(e.file)) !== null && _a !== void 0 ? _a : 0) + 1);
    let probeFile = null;
    let expectedCount = 0;
    for (const [file, n] of perFile) {
        if (n > expectedCount && typeof fixture.seed[file] === "string") {
            probeFile = file;
            expectedCount = n;
        }
    }
    if (probeFile === null)
        return null;
    const twinFile = "__probe_twin__/" + probeFile.split("/").pop();
    if (typeof fixture.seed[twinFile] === "string")
        return null;
    const seed = { ...fixture.seed, [twinFile]: fixture.seed[probeFile] };
    return { seed, locations: [probeFile, twinFile], expectedCount };
}
const SKIP_ANALYSIS = "analysis engine unavailable — pins the analysis-on path";
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
                results.push({ name: fixture.name, ok: true, missing: [], unexpected: [], skipped: SKIP_ANALYSIS });
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
            results.push({ name: fixture.name, ok: false, missing: [], unexpected: [], error: e instanceof Error ? e.message : String(e) });
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
            results.push({ name: "shared innocent corpus", ok: false, missing: [], unexpected: [], error: e instanceof Error ? e.message : String(e) });
        }
    }
    // The duplicate-location sensitivity probe (D24).
    const flagShaped = fixtures.find((f) => f.expected.length > 0);
    if (flagShaped !== undefined) {
        const probe = buildDuplicateLocationProbe(flagShaped);
        if (probe !== null) {
            const name = `duplicate-location sensitivity (from "${flagShaped.name}")`;
            if (declaresNeeds && flagShaped.analysis !== "off" && analysisAvailable === false) {
                results.push({ name, ok: true, missing: [], unexpected: [], skipped: SKIP_ANALYSIS });
            }
            else {
                try {
                    setAnalysisDisabled(flagShaped.analysis === "off");
                    const atLocations = await inSandbox(probe.seed, (tmp) => runOnce(tmp, mod, { includeTests: true }))
                        .then((r) => r.findings
                        .filter((f) => probe.locations.includes(f.file)));
                    const ok = atLocations.length >= probe.expectedCount * 2;
                    results.push({
                        name,
                        ok,
                        missing: ok ? [] : Array.from({ length: probe.expectedCount * 2 - atLocations.length }, () => ({ file: probe.locations[0], line: 1 })),
                        unexpected: [],
                        error: ok ? undefined : `planted the same violation twice at different locations (${probe.locations.join(", ")}) but got ${atLocations.length} finding(s) — ${probe.expectedCount} x2 expected. A dedup keyed on statement text collapses distinct violations sharing a body.`,
                    });
                }
                catch (e) {
                    results.push({ name, ok: false, missing: [], unexpected: [], error: e instanceof Error ? e.message : String(e) });
                }
                finally {
                    setAnalysisDisabled(false);
                }
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
                results.push({ name, ok: false, missing: [], unexpected: [], error: "unreadable expect.json: " + (e instanceof Error ? e.message : String(e)) });
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
                    results.push({ name, ok: true, missing: [], unexpected: [], skipped: SKIP_ANALYSIS });
                    continue;
                }
                const diff = await inSandbox(seed, (tmp) => runOnce(tmp, mod, { includeTests: true }))
                    .then((r) => contract.compareFindings(expected, r.findings));
                results.push({ name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff });
            }
            catch (e) {
                results.push({ name, ok: false, missing: [], unexpected: [], error: e instanceof Error ? e.message : String(e) });
            }
        }
    }
    return results;
}
// A shipped corpus directory, resolved next to the compiled module (bin/'s
// sibling fixtures/), or null when absent — an unbundled checkout still
// certifies, just without the commons.
function corpusDir(name) {
    try {
        const dir = fs.realpathSync(new URL("../fixtures/" + name, import.meta.url));
        return fs.existsSync(dir) ? dir : null;
    }
    catch {
        return null;
    }
}
