# Handoff — prevention tier 2

Written at `e59ad2f` on `experience/d15-npx-onboarding` (merged to main), version 0.0.6 published.

## What just happened (read D21–D23 first)

Two external audits found systematic false positives in slop-doctor (D21) and convex-doctor (D22). Both were repaired. D23 added the first prevention tier: the claim contract (verify refuses checks without `claim`/`lookalikes`/`onUnknown`) and the shared innocent corpus (`fixtures/innocent/` — files that look guilty but aren't; every doctor's verify runs against them with `expected: []`).

A third audit round on convex-doctor 0.0.6 found three remaining issues (push-then-await consumption, expiration clocks, chain-start dedup) — all fixed at `e59ad2f`.

## What to build next (from the advisor's recommendation, prioritized)

### 1. Duplicate-location framework test — DONE (D24)

Shipped in the loader's verify branch: every verify takes the doctor's
first flag-shaped fixture, plants the violation at a second location
(a byte-identical twin module, `__probe_twin__/<name>` — transform-free
by design; an earlier transform-based shape broke cross-module identity
checks), and demands the count across both locations at least double.
Floor, not equality — over-reporting stays compareFindings' job.

### 2. Sensitivity corpus — DONE (D24)

`fixtures/sensitivity/`: case dirs of seed files + `expect.json` mapping
doctor id → expected findings; doctors only run cases they have stakes
in. Seeded with the three audit patterns: ratelimiter-unbounded-collect,
billing-triple (three findings at three chain-start lines — the dedup
regression frozen as data), dead-prompt-builders. Plus `test-stake`, a
synthetic case exercising the mechanism for the loader tests.

### 3. Release diff (`any-doctor diff-scan`)

Run the current version against a target, then compare with the previous version's scan (stored via `--format json` output). Classify each delta: disappearing FP = progress; disappearing real finding = regression. Gate releases on the classification.

### 4. Architecture pass

The last one was before the slop-doctor build. Since then: the loader grew the claim contract + innocent corpus; the analysis adapter was rebuilt on @typescript-eslint/scope-manager; the masker changed regex semantics; five doctors went through multiple generations. Run the improve-codebase-architecture skill. Predicted findings: the loader is accreting (contract + corpus + fixtures = three verify-mode policies wanting one seam); doctors still carry private text-processing (convex-doctor doesn't use ctx.analysis at all).

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
