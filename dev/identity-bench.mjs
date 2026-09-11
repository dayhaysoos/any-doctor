// The identity layer's benchmark of record (analysis-improvements M1):
// duplicate-heavy matched buckets — the path the review found quadratic —
// alongside the all-unmatched path. Run: node dev/identity-bench.mjs
import { compareOccurrences } from "../bin/identity.js";

const mk = (n, digest) => Array.from({ length: n }, (_, i) => ({
  checkKey: "doc/rule", file: "x.ts", line: i + 1,
  lineDigest: digest ?? "d" + i, relColumn: null, contextId: null, scope: "line",
}));

for (const n of [10000, 30000, 100000]) {
  // Matched duplicates: one bucket of n identical occurrences on each side.
  const dup = mk(n, "same");
  let t0 = process.hrtime.bigint();
  let c = compareOccurrences(dup, dup);
  const dupMs = Number(process.hrtime.bigint() - t0) / 1e6;

  // All-unmatched: every head key misses its bucket.
  const base = mk(n);
  const head = mk(n, "other");
  t0 = process.hrtime.bigint();
  c = compareOccurrences(base, head);
  const missMs = Number(process.hrtime.bigint() - t0) / 1e6;

  console.log(`${n} occurrences/side: duplicate-matched ${dupMs.toFixed(0)}ms (pairs ${n}), all-unmatched ${missMs.toFixed(0)}ms (added ${c.addedIndices.length})`);
}
