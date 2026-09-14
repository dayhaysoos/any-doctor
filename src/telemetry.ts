import path from "node:path";
import { createRequire } from "node:module";
import { bundledDoctorsDir } from "./discover.js";

// Anonymous run counts — the only network call any-doctor ever makes,
// fired by the host AFTER doctors finish (doctors keep their no-network
// confinement). One POST per run. Payload, in full:
//
//   { v: tool version, doctors: bundled ids that ran, custom: count }
//
// Nothing else. No names of user-authored doctors, no file paths, no
// findings, no decision reasons, no machine or repo identifiers. The
// bundled ids are public knowledge (they ship in the package); a doctor
// is "bundled" only when the program that ran lives in the bundled pack
// — a local file shadowing a bundled name counts as custom, not bundled.
//
// Kill switch: ANY_DOCTOR_NO_TELEMETRY=1 (or "true"). Tests and local
// development set it in the npm test script; ANY_DOCTOR_TELEMETRY_URL
// overrides the endpoint.

const DEFAULT_ENDPOINT = "https://metrics.anydoctor.dev/count";
const DISABLE_ENV = "ANY_DOCTOR_NO_TELEMETRY";
const URL_ENV = "ANY_DOCTOR_TELEMETRY_URL";

let toolVersion = "dev";
try {
  toolVersion = createRequire(import.meta.url)("../package.json").version;
} catch {
  // Unresolvable package.json (unusual install layouts) degrades to a
  // constant rather than breaking the run count.
}

export interface RunCountPayload {
  v: string;
  doctors: string[];
  custom: number;
}

export function telemetryEnabled(): boolean {
  const off = process.env[DISABLE_ENV];
  return off !== "1" && off !== "true";
}

// Classification is by program location, not by id text: the bundled
// doctor ids are safe to name precisely because they live in the pack.
export function buildRunCount(ran: { id: string; programPath: string }[]): RunCountPayload | null {
  if (ran.length === 0) return null;
  const bundledDir = bundledDoctorsDir();
  const doctors: string[] = [];
  let custom = 0;
  for (const d of ran) {
    const rel = path.relative(bundledDir, d.programPath);
    const isBundled = rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
    if (isBundled) doctors.push(d.id);
    else custom += 1;
  }
  return { v: toolVersion, doctors, custom };
}

// Fire-and-forget by contract: a dead or slow endpoint is a silent
// no-op. The 1s abort bounds the drain cost at process exit (the CLI
// sets exitCode, never process.exit, so pending fetch completes).
export async function sendRunCount(payload: RunCountPayload): Promise<boolean> {
  const endpoint = process.env[URL_ENV] ?? DEFAULT_ENDPOINT;
  if (!endpoint || !telemetryEnabled()) return false;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
