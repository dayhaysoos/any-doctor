import { Severity } from "./contract.js";

// The Gate: a run's exit policy, in one module. Advisory by default —
// findings never fail unless --fail-on asks (the posture React Doctor
// proved: a scanner that reds CI on first adoption gets uninstalled);
// crashes and Confinement skips fail ALWAYS, because an infrastructure
// failure is not a finding and must never paint a run green. In diff
// mode (--base), only ADDED findings count against the bar: a change is
// judged by what it introduces, not by the debt it was born into.

export type FailOn = "none" | "error" | "warning" | "info";

const RANK: Record<FailOn, number> = { none: 0, info: 1, warning: 2, error: 3 };
const SEVERITY_RANK: Record<Severity, number> = { info: 1, warning: 2, error: 3 };

export function isFailOn(v: string): v is FailOn {
  return v === "none" || v === "error" || v === "warning" || v === "info";
}

export interface GateCounts {
  error: number;
  warning: number;
  info: number;
}

export interface GateVerdict {
  fails: boolean;
  // The one line a human reads when the gate trips — null when it
  // doesn't. Data for JSON, prose for stderr.
  reason: string | null;
  failOn: FailOn;
  mode: "full" | "diff";
}

// The bar is "at or above": --fail-on warning fails on warnings AND
// errors. Counts are whatever the mode defines as gateable — the
// summary's severity counts in full mode, the ADDED findings' counts in
// diff mode.
export function gateVerdict(failOn: FailOn, counts: GateCounts, mode: "full" | "diff"): GateVerdict {
  if (failOn === "none") {
    return { fails: false, reason: null, failOn, mode };
  }
  const offending = (Object.keys(counts) as Severity[])
    .filter(s => counts[s] > 0 && SEVERITY_RANK[s] >= RANK[failOn]);
  if (offending.length === 0) {
    return { fails: false, reason: null, failOn, mode };
  }
  const total = offending.reduce((n, s) => n + counts[s], 0);
  const what = mode === "diff" ? "new finding" : "finding";
  return {
    fails: true,
    reason: `gate: ${total} ${what}${total === 1 ? "" : "s"} at or above ${failOn} (--fail-on ${failOn})`,
    failOn,
    mode,
  };
}

// Added findings → gate counts: severities of the diff's added list,
// each counted once per finding.
export function countsOfSeverities(severities: Severity[]): GateCounts {
  const counts: GateCounts = { error: 0, warning: 0, info: 0 };
  for (const s of severities) counts[s]++;
  return counts;
}
