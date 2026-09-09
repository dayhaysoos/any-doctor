const RANK = { none: 0, info: 1, warning: 2, error: 3 };
const SEVERITY_RANK = { info: 1, warning: 2, error: 3 };
export function isFailOn(v) {
    return v === "none" || v === "error" || v === "warning" || v === "info";
}
// The bar is "at or above": --fail-on warning fails on warnings AND
// errors. Counts are whatever the mode defines as gateable — the
// summary's severity counts in full mode, the ADDED findings' counts in
// diff mode.
export function gateVerdict(failOn, counts, mode) {
    if (failOn === "none") {
        return { fails: false, reason: null, failOn, mode };
    }
    const offending = Object.keys(counts)
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
export function countsOfSeverities(severities) {
    const counts = { error: 0, warning: 0, info: 0 };
    for (const s of severities)
        counts[s]++;
    return counts;
}
