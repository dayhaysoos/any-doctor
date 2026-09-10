import { pathToFileURL } from "url";
import * as fs from "fs";
import * as path from "path";
import { register } from "node:module";
import { runOnce, certify, ClaimContractViolation } from "./certify.js";
import type { DoctorModule } from "./certify.js";
import * as contract from "./contract.js";
import type { Mode } from "./contract.js";

// The doctor loader: the child process every doctor program runs inside.
// It owns the Doctor-run choreography — decode the Mode, confine the
// process, import the doctor, frame the result — and nothing else. Verify
// mode's policies (claim contract, fixture gate, corpora, probes) live in
// the Certification harness; the runner owns the protocol on the parent
// side; this file is the other end.

// The confinement prologue: a doctor's process has no network (the globals
// are deleted before any doctor code can run) and may not import anything
// (a resolve hook refuses every resolution that is not the loader's own).
// Ordering is load-bearing: this must run AFTER this module's own imports
// resolve (certify, contract — which is why they are static imports above)
// and BEFORE the doctor import below. Exported so the choreography has a
// direct test seam instead of being provable only end-to-end.
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
      let results;
      try {
        results = await certify(mod, fixtures as contract.Fixture[]);
      } catch (e) {
        if (e instanceof ClaimContractViolation) {
          console.error(e.message);
          process.exit(3);
        }
        throw e;
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
