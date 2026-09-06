# Kill-test prototype results (2026-08-28)

Setup: 5 rules generated from intent-only one-liners ([intents.md](intents.md)),
fixtures via `sg test`, evaluated on (a) a seeded sample app with known ground
truth and (b) a real production repo (~234 TS files),
with every finding hand-classified. ast-grep 0.45.2.

## Sample app (seeded ground truth)

- **Recall: 7/7 planted violations found (100%)**
- **Precision: 8/8 (100%)** — the 8th finding was a *real* violation planted
  by accident (an uncounted single-arg fetch) — correctly flagged
- All 6 clean lookalikes (gateway imports, signal-ed fetches, 2-arg z.record,
  logger catch, Promise.all-wrapped map, catch-with-return-null) correctly silent

## Real repo (hand-verified findings)

| Rule | Findings | TP | FP | Precision |
|---|---|---|---|---|
| fetch-without-abort-signal `[R]` | 5 | 5 | 0 | **100%** |
| map-async-no-promise-all `[R]` | 3* | 0 | 3* | 0% |

\* The table shows the two rules with real-repo findings. `zod-record-two-args`
had no z.record usage in the target (fixtures only), and the two `[P]` import/
catch rules fired zero times on this repo (no openai imports; no empty catches
among 47 catch sites — spot-checked).

**All 3 false positives are ONE rule hitting its DECLARED blind spot**: the
map-async rule flags `const p = xs.map(async ...)` even when `p` is later
wrapped in `Promise.all(p)` / `Promise.allSettled(p)` on a subsequent line —
a cross-statement dataflow question that within-file relational operators
cannot answer.

## Verdict vs kill-test criteria

- ✅ End-to-end loop works: intent → generated rule + fixtures → `sg test` →
  scan → evidence-bearing findings. Whole thing in one working session.
- ✅ Syntactic + simple-relational rules: precision 100% on real code.
- ⚠️ 90% precision bar: **not met by the weakest rule** (map-async = 0/3 on
  real repo). The failure is precisely the analysis-tier boundary, not a
  generation failure — the rule does what its tier can do.
- ✅ Generation reliability: 11 repairs across 5 rules, every one falling
  into ~6 mechanical categories (see [REPAIR-LOG.md](REPAIR-LOG.md)) —
  teachable to the generation skill.

## Product implications

1. **The premise is viable.** An agent can author fixture-tested ast-grep
   rules that find real bugs in real code, and the fixture harness catches
   generation bugs before they reach a user's CI.
2. **The tier boundary is real and now measured.** Within-file relational
   rules are safe; dataflow-adjacent rules ("is this result ever awaited?")
   need either the semantic tier (D4 trigger evidence, as designed) or must
   be shipped as audit-mode rules with their blind spot declared (D7).
3. **Two fixture layers are required**, inline (`sg test`) and scan-level
   seeded ground truth — inline tests cannot catch glob/scope/double-report
   bugs (empirically demonstrated).
4. **ast-grep's silent schema acceptance is a footgun** the harness must
   defend against (misspelled field = rule that excludes nothing and never
   says so).
5. Cloudflare Code Mode: confirmed unnecessary for any of this (D2). The
   entire loop ran locally with the user's own agent.

## Next

- Write the generation skill encoding the REPAIR-LOG's category lessons;
  re-run this exact experiment measuring FIRST-shot yield (no repairs).
  That number is the product's core metric.
- Real kill test on the Effect codebase (dogfood), per docs/kill-test.md.
- map-async rule is the concrete candidate to motivate the oxlint/oxc tier.
