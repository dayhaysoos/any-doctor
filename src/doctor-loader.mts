import { pathToFileURL } from "url";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { register } from "node:module";
import { buildCtx, setAnalysisDisabled, probeAnalysisAvailable } from "./sdk.js";
import * as contract from "./contract.js";
import type { Finding, Mode } from "./contract.js";

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
export function confineProcess(): void {
  const g = globalThis as Record<string, unknown>;
  delete g.fetch;
  try { delete g.WebSocket; } catch { /* already absent */ }
  try {
    register(new URL("./import-guard.mjs", import.meta.url));
  } catch {
    // No loader hooks on this runtime — the other confinement layers still apply.
  }
}

const USAGE = "usage: doctor-loader.mjs <program.(m)js> <root> [--include-tests] | <program.(m)js> --verify <fixtures.(m)js> | <program.(m)js> --meta";

interface DoctorModule {
  meta?: unknown;
  doctor?: (ctx: ReturnType<typeof buildCtx>["ctx"]) => unknown;
}

const SEVERITIES = new Set(["error", "warning", "info"]);

function validateMeta(mod: DoctorModule): void {
  const m = mod.meta as Record<string, unknown> | undefined;
  const problems: string[] = [];
  if (!m || typeof m !== "object") problems.push("missing meta export");
  if (m && typeof m.id !== "string") problems.push("meta.id must be a string");
  if (m && typeof m.description !== "string") problems.push("meta.description must be a string");
  if (m && !SEVERITIES.has(String(m.severity))) problems.push(`meta.severity must be one of error|warning|info — got ${JSON.stringify(m.severity)}`);
  if (problems.length) {
    console.error("invalid doctor meta: " + problems.join("; "));
    process.exit(3);
  }
}

function runOnce(root: string, mod: DoctorModule, opts: { includeTests: boolean }): Promise<Record<string, unknown>> {
  const started = Date.now();
  const { ctx, getFindings } = buildCtx(root, opts);
  const fileCount = ctx.files.list().length;
  const result = mod.doctor!(ctx);
  if (!result || typeof (result as Promise<unknown>).then !== "function") {
    throw new Error("doctor() must be async — declare it `export async function doctor(ctx)`");
  }
  return (result as Promise<void>).then(() => ({
    protocolVersion: contract.PROTOCOL_VERSION,
    kind: "run",
    root,
    fileCount,
    durationMs: Date.now() - started,
    meta: mod.meta,
    findings: getFindings() as Finding[],
  }));
}

// The duplicate-location sensitivity probe (D23 tier 2): a doctor's own
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
function buildDuplicateLocationProbe(fixture: contract.Fixture):
  | { seed: Record<string, string>; locations: string[]; expectedCount: number }
  | null {
  const perFile = new Map<string, number>();
  for (const e of fixture.expected) perFile.set(e.file, (perFile.get(e.file) ?? 0) + 1);
  let probeFile: string | null = null;
  let expectedCount = 0;
  for (const [file, n] of perFile) {
    if (n > expectedCount && typeof fixture.seed[file] === "string") {
      probeFile = file;
      expectedCount = n;
    }
  }
  if (probeFile === null) return null;
  const twinFile = "__probe_twin__/" + probeFile.split("/").pop();
  if (typeof fixture.seed[twinFile] === "string") return null;
  const seed = { ...fixture.seed, [twinFile]: fixture.seed[probeFile] };
  return { seed, locations: [probeFile, twinFile], expectedCount };
}

function materializeSeed(tmp: string, rel: string, content: string): void {
  const abs = path.resolve(tmp, rel);
  if (abs !== tmp && !abs.startsWith(tmp + path.sep)) {
    throw new Error(`fixture seed path escapes the sandbox: ${rel}`);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

async function main(): Promise<void> {
  confineProcess();

  // The mode arrives as argv and is decoded exactly once, here, into a value.
  const decoded = contract.decodeLoaderArgs(process.argv.slice(2));
  if (decoded === null) {
    console.error(USAGE);
    process.exit(2);
  }
  const prog = decoded.program;
  const mode: Mode = decoded.mode;

  const mod = (await import(pathToFileURL(prog).href)) as DoctorModule;
  if (typeof mod.doctor !== "function") {
    console.error("doctor program must export `doctor(ctx)` — got: " + Object.keys(mod).join(", "));
    process.exit(3);
  }
  validateMeta(mod);

  const originalLog = console.log;
  console.log = (...args: unknown[]) => { process.stderr.write(args.map(a => String(a)).join(" ") + "\n"); };

  try {
    if (mode.kind === "meta") {
      process.stdout.write("\n" + contract.RESULT_SENTINEL + JSON.stringify({
        protocolVersion: contract.PROTOCOL_VERSION,
        kind: "meta",
        meta: mod.meta,
      }) + "\n");
    } else if (mode.kind === "run") {
      const result = await runOnce(mode.root, mod, { includeTests: contract.includeTestsFor(mode) });
      process.stdout.write("\n" + contract.RESULT_SENTINEL + JSON.stringify(result) + "\n");
    } else {
      const fixturesMod = (await import(pathToFileURL(mode.fixtures).href)) as { fixtures?: unknown };
      const fixtures = fixturesMod.fixtures;
      if (!Array.isArray(fixtures)) {
        console.error("fixture module must export `fixtures` (array) — got: " + Object.keys(fixturesMod).join(", "));
        process.exit(3);
      }
      // The claim contract (D23): certification requires each declared
      // check to state the observable condition it establishes, its
      // innocent lookalikes, and - when it needs the identity engine -
      // what happens on unknown. Prose impact is not a testable claim.
      const checks = (mod.meta as { checks?: unknown[] } | undefined)?.checks;
      if (Array.isArray(checks)) {
        const problems: string[] = [];
        for (const c of checks as Record<string, unknown>[]) {
          if (typeof c.claim !== "string" || c.claim.trim().length === 0) {
            problems.push(`check "${String(c.id)}": claim is required — one sentence, the observable condition detected, not the consequence`);
          }
          if (!Array.isArray(c.lookalikes) || (c.lookalikes as unknown[]).length === 0) {
            problems.push(`check "${String(c.id)}": lookalikes is required — at least one innocent shape that must stay silent`);
          }
          if (Array.isArray(c.needs) && (c.needs as unknown[]).length > 0
            && (c.onUnknown !== "narrow" && c.onUnknown !== "skip")) {
            problems.push(`check "${String(c.id)}": onUnknown is required when needs is declared — "narrow" or "skip"`);
          }
        }
        if (problems.length > 0) {
          console.error("claim contract violations:\n  " + problems.join("\n  "));
          process.exit(3);
        }
      }
      const results: unknown[] = [];
      // Only a doctor whose checks declare analysis needs can have
      // analysis-on fixtures — probing anyone else would make a
      // channel-less direct invocation fail fixtures that never touch
      // analysis at all.
      const declaresNeeds = contract.narrowedCheckIds(mod.meta as contract.DoctorMeta).length > 0;
      let analysisAvailable: boolean | undefined;
      for (const fixture of fixtures as contract.Fixture[]) {
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
          const diff = contract.compareFindings(fixture.expected, (result as { findings: Finding[] }).findings);
          results.push({ name: fixture.name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff });
        } catch (e) {
          results.push({ name: fixture.name, ok: false, missing: [], unexpected: [], error: e instanceof Error ? e.message : String(e) });
        } finally {
          setAnalysisDisabled(false);
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      }
      // The shared innocent corpus (D23): files that look guilty but
      // aren't — the audit counterexamples as commons. Every doctor runs
      // against them with expected: []; a finding here is a false positive
      // by definition, whoever wrote the check.
      const innocentDir = fs.realpathSync(new URL("../fixtures/innocent", import.meta.url));
      if (fs.existsSync(innocentDir)) {
        const seed: Record<string, string> = {};
        const collect = (dir: string, prefix: string): void => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, entry.name);
            const rel = prefix ? prefix + "/" + entry.name : entry.name;
            if (entry.isDirectory()) collect(abs, rel);
            else seed[rel] = fs.readFileSync(abs, "utf8");
          }
        };
        collect(innocentDir, "");
        try {
          const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-verify-innocent-"));
          try {
            for (const [rel, content] of Object.entries(seed)) materializeSeed(tmp, rel, content);
            const result = await runOnce(tmp, mod, { includeTests: true });
            const diff = contract.compareFindings([], (result as { findings: contract.Finding[] }).findings);
            results.push({
              name: "shared innocent corpus (" + Object.keys(seed).length + " files)",
              ok: diff.missing.length === 0 && diff.unexpected.length === 0,
              ...diff,
            });
          } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
          }
        } catch (e) {
          results.push({ name: "shared innocent corpus", ok: false, missing: [], unexpected: [], error: e instanceof Error ? e.message : String(e) });
        }
      }
      // The duplicate-location sensitivity probe (D23 tier 2): plant the
      // doctor's own flagged shape twice at different locations in one
      // file and demand the finding count at least double — a dedup keyed
      // on statement text collapses the pair and fails here.
      {
        const flagShaped = (fixtures as contract.Fixture[]).find((f) => f.expected.length > 0);
        if (flagShaped !== undefined) {
        const probe = buildDuplicateLocationProbe(flagShaped);
        if (probe !== null) {
          const name = `duplicate-location sensitivity (from "${flagShaped.name}")`;
          if (declaresNeeds && flagShaped.analysis !== "off" && analysisAvailable === false) {
            results.push({ name, ok: true, missing: [], unexpected: [], skipped: "analysis engine unavailable — pins the analysis-on path" });
          } else try {
            setAnalysisDisabled(flagShaped.analysis === "off");
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-verify-dup-"));
            try {
              for (const [rel, content] of Object.entries(probe.seed)) materializeSeed(tmp, rel, content);
              const result = await runOnce(tmp, mod, { includeTests: true });
              const atLocations = (result as { findings: contract.Finding[] }).findings
                .filter((f) => probe.locations.includes(f.file));
              const ok = atLocations.length >= probe.expectedCount * 2;
              results.push({
                name,
                ok,
                missing: ok ? [] : Array.from({ length: probe.expectedCount * 2 - atLocations.length },
                  () => ({ file: probe.locations[0], line: 1 })),
                unexpected: [],
                error: ok ? undefined : `planted the same violation twice at different locations (${probe.locations.join(", ")}) but got ${atLocations.length} finding(s) — ${probe.expectedCount} x2 expected. A dedup keyed on statement text collapses distinct violations sharing a body.`,
              });
            } finally {
              fs.rmSync(tmp, { recursive: true, force: true });
            }
          } catch (e) {
            results.push({ name, ok: false, missing: [], unexpected: [], error: e instanceof Error ? e.message : String(e) });
          } finally {
            setAnalysisDisabled(false);
          }
        }
        }
      }
      // The sensitivity corpus (D23 tier 2): the innocent corpus's
      // complement — confirmed-real patterns from the audits, patterns
      // that MUST produce findings. Each case directory carries its seed
      // files plus an expect.json mapping doctor id -> expected findings;
      // a doctor only runs the cases it has stakes in.
      {
        const sensDir = fs.realpathSync(new URL("../fixtures/sensitivity", import.meta.url));
        if (fs.existsSync(sensDir)) {
          for (const entry of fs.readdirSync(sensDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (!entry.isDirectory()) continue;
            const caseDir = path.join(sensDir, entry.name);
            const expectPath = path.join(caseDir, "expect.json");
            if (!fs.existsSync(expectPath)) continue;
            const name = `sensitivity: ${entry.name}`;
            let manifest: { expect?: Record<string, unknown> };
            try {
              manifest = JSON.parse(fs.readFileSync(expectPath, "utf8"));
            } catch (e) {
              results.push({ name, ok: false, missing: [], unexpected: [], error: "unreadable expect.json: " + (e instanceof Error ? e.message : String(e)) });
              continue;
            }
            const expected = manifest?.expect?.[String((mod.meta as contract.DoctorMeta).id)];
            if (!Array.isArray(expected)) continue;
            try {
              const seed: Record<string, string> = {};
              const collect = (dir: string, prefix: string): void => {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                  const abs = path.join(dir, e.name);
                  const rel = prefix ? prefix + "/" + e.name : e.name;
                  if (e.isDirectory()) collect(abs, rel);
                  else if (e.name !== "expect.json") seed[rel] = fs.readFileSync(abs, "utf8");
                }
              };
              collect(caseDir, "");
              const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "any-doctor-verify-sens-"));
              try {
                for (const [rel, content] of Object.entries(seed)) materializeSeed(tmp, rel, content);
                if (declaresNeeds && analysisAvailable === undefined) analysisAvailable = probeAnalysisAvailable(tmp);
                if (declaresNeeds && analysisAvailable === false) {
                  results.push({
                    name,
                    ok: true,
                    missing: [],
                    unexpected: [],
                    skipped: "analysis engine unavailable — pins the analysis-on path",
                  });
                  continue;
                }
                const result = await runOnce(tmp, mod, { includeTests: true });
                const diff = contract.compareFindings(expected as contract.ExpectedFinding[], (result as { findings: contract.Finding[] }).findings);
                results.push({ name, ok: diff.missing.length === 0 && diff.unexpected.length === 0, ...diff });
              } finally {
                fs.rmSync(tmp, { recursive: true, force: true });
              }
            } catch (e) {
              results.push({ name, ok: false, missing: [], unexpected: [], error: e instanceof Error ? e.message : String(e) });
            }
          }
        }
      }
      process.stdout.write("\n" + contract.RESULT_SENTINEL + JSON.stringify({
        protocolVersion: contract.PROTOCOL_VERSION,
        kind: "verify",
        meta: mod.meta,
        results,
      }) + "\n");
    }
  } finally {
    console.log = originalLog;
  }
}

// Direct-invocation guard: importing this module (tests, future tooling)
// never executes a Doctor run — the script body runs only when spawned.
const invokedDirectly = (() => {
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

try {
  if (invokedDirectly) await main();
} catch (e) {
  console.error(e instanceof Error && e.stack ? e.stack : String(e));
  process.exit(1);
}
