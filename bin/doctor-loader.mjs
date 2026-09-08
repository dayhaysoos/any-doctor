import { pathToFileURL } from "url";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { register } from "node:module";
import { buildCtx, setAnalysisDisabled, probeAnalysisAvailable } from "./sdk.js";
import * as contract from "./contract.js";
// The doctor loader: the child process every doctor program runs inside.
// It owns the Doctor-run choreography — decode the Mode, confine the
// process, import the doctor, frame the result — and nothing else. The
// runner owns the protocol on the parent side; this file is the other end.
// The confinement prologue: a doctor's process has no network (the globals
// are deleted before any doctor code can run) and may not import anything
// (a resolve hook refuses every resolution that is not the loader's own).
// Ordering is load-bearing: this must run AFTER this module's own imports
// resolve (sdk, contract — which is why they are static imports above) and
// BEFORE the doctor import below. Exported so the choreography has a direct
// test seam instead of being provable only end-to-end.
export function confineProcess() {
    const g = globalThis;
    delete g.fetch;
    try {
        delete g.WebSocket;
    }
    catch { /* already absent */ }
    try {
        register(new URL("./import-guard.mjs", import.meta.url));
    }
    catch {
        // No loader hooks on this runtime — the other confinement layers still apply.
    }
}
const USAGE = "usage: doctor-loader.mjs <program.(m)js> <root> [--include-tests] | <program.(m)js> --verify <fixtures.(m)js> | <program.(m)js> --meta";
const SEVERITIES = new Set(["error", "warning", "info"]);
function validateMeta(mod) {
    const m = mod.meta;
    const problems = [];
    if (!m || typeof m !== "object")
        problems.push("missing meta export");
    if (m && typeof m.id !== "string")
        problems.push("meta.id must be a string");
    if (m && typeof m.description !== "string")
        problems.push("meta.description must be a string");
    if (m && !SEVERITIES.has(String(m.severity)))
        problems.push(`meta.severity must be one of error|warning|info — got ${JSON.stringify(m.severity)}`);
    if (problems.length) {
        console.error("invalid doctor meta: " + problems.join("; "));
        process.exit(3);
    }
}
function runOnce(root, mod, opts) {
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
function materializeSeed(tmp, rel, content) {
    const abs = path.resolve(tmp, rel);
    if (abs !== tmp && !abs.startsWith(tmp + path.sep)) {
        throw new Error(`fixture seed path escapes the sandbox: ${rel}`);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
}
async function main() {
    var _a;
    confineProcess();
    // The mode arrives as argv and is decoded exactly once, here, into a value.
    const decoded = contract.decodeLoaderArgs(process.argv.slice(2));
    if (decoded === null) {
        console.error(USAGE);
        process.exit(2);
    }
    const prog = decoded.program;
    const mode = decoded.mode;
    const mod = (await import(pathToFileURL(prog).href));
    if (typeof mod.doctor !== "function") {
        console.error("doctor program must export `doctor(ctx)` — got: " + Object.keys(mod).join(", "));
        process.exit(3);
    }
    validateMeta(mod);
    const originalLog = console.log;
    console.log = (...args) => { process.stderr.write(args.map(a => String(a)).join(" ") + "\n"); };
    try {
        if (mode.kind === "meta") {
            process.stdout.write("\n" + contract.RESULT_SENTINEL + JSON.stringify({
                protocolVersion: contract.PROTOCOL_VERSION,
                kind: "meta",
                meta: mod.meta,
            }) + "\n");
        }
        else if (mode.kind === "run") {
            const result = await runOnce(mode.root, mod, { includeTests: contract.includeTestsFor(mode) });
            process.stdout.write("\n" + contract.RESULT_SENTINEL + JSON.stringify(result) + "\n");
        }
        else {
            const fixturesMod = (await import(pathToFileURL(mode.fixtures).href));
            const fixtures = fixturesMod.fixtures;
            if (!Array.isArray(fixtures)) {
                console.error("fixture module must export `fixtures` (array) — got: " + Object.keys(fixturesMod).join(", "));
                process.exit(3);
            }
            const results = [];
            // Only a doctor whose checks declare analysis needs can have
            // analysis-on fixtures — probing anyone else would make a
            // channel-less direct invocation fail fixtures that never touch
            // analysis at all.
            const meta = mod.meta;
            const declaresNeeds = ((_a = meta.checks) !== null && _a !== void 0 ? _a : []).some((c) => c.needs && c.needs.length > 0);
            let analysisAvailable;
            for (const fixture of fixtures) {
                const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-verify-"));
                try {
                    for (const [rel, content] of Object.entries(fixture.seed)) {
                        materializeSeed(tmp, rel, content);
                    }
                    // The fixture's declared analysis mode: "off" forces the
                    // degraded path (pinning the narrowed behavior); the default
                    // "on" runs with the engine — and skips honestly when it is
                    // not installed here, rather than failing a fixture whose
                    // expectations belong to the full-power path.
                    setAnalysisDisabled(fixture.analysis === "off");
                    if (declaresNeeds && fixture.analysis !== "off" && analysisAvailable === undefined) {
                        analysisAvailable = probeAnalysisAvailable(tmp);
                    }
                    if (declaresNeeds && fixture.analysis !== "off" && analysisAvailable === false) {
                        results.push({
                            name: fixture.name,
                            ok: true,
                            missing: [],
                            unexpected: [],
                            skipped: "analysis engine unavailable — pins the analysis-on path",
                        });
                        continue;
                    }
                    // Verify always lists everything (includeTestsFor): the sandbox is
                    // the doctor's own world — a seed named *.test.ts is deliberate
                    // test data (effect-v4-doctor's sleep-in-test depends on it).
                    const result = await runOnce(tmp, mod, { includeTests: contract.includeTestsFor(mode) });
                    const diff = contract.compareFindings(fixture.expected, result.findings);
                    results.push({ name: fixture.name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff });
                }
                catch (e) {
                    results.push({ name: fixture.name, ok: false, missing: [], unexpected: [], error: e instanceof Error ? e.message : String(e) });
                }
                finally {
                    setAnalysisDisabled(false);
                    fs.rmSync(tmp, { recursive: true, force: true });
                }
            }
            process.stdout.write("\n" + contract.RESULT_SENTINEL + JSON.stringify({
                protocolVersion: contract.PROTOCOL_VERSION,
                kind: "verify",
                meta: mod.meta,
                results,
            }) + "\n");
        }
    }
    finally {
        console.log = originalLog;
    }
}
// Direct-invocation guard: importing this module (tests, future tooling)
// never executes a Doctor run — the script body runs only when spawned.
const invokedDirectly = (() => {
    try {
        return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
    }
    catch {
        return false;
    }
})();
try {
    if (invokedDirectly)
        await main();
}
catch (e) {
    console.error(e instanceof Error && e.stack ? e.stack : String(e));
    process.exit(1);
}
