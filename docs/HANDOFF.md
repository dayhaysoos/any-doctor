# Handoff — prevention tier 2

Written at `e59ad2f` on `experience/d15-npx-onboarding` (merged to main), version 0.0.6 published.

## What just happened (read D21–D23 first)

Two external audits found systematic false positives in slop-doctor (D21) and convex-doctor (D22). Both were repaired. D23 added the first prevention tier: the claim contract (verify refuses checks without `claim`/`lookalikes`/`onUnknown`) and the shared innocent corpus (`fixtures/innocent/` — files that look guilty but aren't; every doctor's verify runs against them with `expected: []`).

A third audit round on convex-doctor 0.0.6 found three remaining issues (push-then-await consumption, expiration clocks, chain-start dedup) — all fixed at `e59ad2f`.

## What to build next (from the advisor's recommendation, prioritized)

### 1. Duplicate-location framework test — DONE (D24, hardened in the review loop)

In the Certification harness: every verify picks the doctor's strongest
flag-shaped fixture (most expected findings in one seeded file) and
plants it at three locations — untouched original, a byte-identical
twin module, and a pair file with the violation doubled inside one file
(the billing.ts shape). Original and twin must each reproduce the
fixture's expected count (counting only expected rules); the pair file
must reach 2x when the witness seeded ≥2 findings in one file (the
per-violation proof — file-scoped claims are respected; zero pair
findings are exempt, the wrap can remove needed context). Text-keyed
dedup fails deterministically.

### 2. Sensitivity corpus — DONE (D24)

`fixtures/sensitivity/`: case dirs of seed files + `expect.json` mapping
doctor id → expected findings; doctors only run cases they have stakes
in. Seeded with the three audit patterns: ratelimiter-unbounded-collect,
billing-triple (three findings at three chain-start lines — the dedup
regression frozen as data), dead-prompt-builders. Tests exercise the
mechanism through ANY_DOCTOR_CORPUS_ROOT with their own corpora — the
shipped commons hold audit patterns only.

### 3. Release diff (`any-doctor diff-scan`)

Run the current version against a target, then compare with the previous version's scan (stored via `--format json` output). Classify each delta: disappearing FP = progress; disappearing real finding = regression. Gate releases on the classification.

### 4. Architecture pass — DONE (D25–D27)

The Certification harness extraction (D25) shipped first; then card 2 in
two stages (D26): the three private maskNonCode copies deleted
(readMasked is the one masker) and `ctx.analysis.spans(file)` added —
function spans as an AST fact, piloted in slop-doctor's duplicate check
with the brace-counting scan kept as the declared degraded path. Card 3
(cohort) needed no deepening — already deep, one interface wart fixed
(D27). Remaining named work: convex's kind-carrying spans and the
statement-boundary walkers migrate on their triggers (D26).

## Key facts

- 5 bundled doctors: async, convex, effect-v4, openrouter, slop — 41 checks, ~160 fixtures + innocent corpus
- 262/262 tests, all fixture gates green
- Engine: oxc-parser + @typescript-eslint/scope-manager (JSX refs, type positions, `exported`/`excluded` facts)
- Masker: regex-literal aware; `<` and `>` deliberately NOT regex preceders (JSX closing tags)
- `prepublishOnly` runs the full suite
- Skill teaches the claim contract and engine-facts law (no regex workarounds)
- Corpus at `~/Code/slop-corpus/` (1,368 findings, 182 PRs, 109 recurring patterns — only the top 10 shipped as checks)
- npm: 0.0.6 published; version law is bump-per-publish

## Working pattern

Branch per chapter, fixtures gate everything, review-loop-to-zero for major changes, `--no-ff` merge to main. `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"` before any node command.
