# Convex modernization: implementation verification

Ready for separate independent review of the stated Convex 1.x scope. This is
implementation-authored verification, not independent acceptance, a population
accuracy estimate, a deployment test or permission to apply every recommendation.
Known coverage gaps remain executable and visible below. Nothing was staged,
committed, pushed, published or deployed.

## Candidate identity and preservation

Repository `/Users/nickdejesus/Code/any-doctor`, branch `website/docs`.
Starting and final HEAD: `b7615748884c738bf8ccc3aef06ef69daf223f02`.
The candidate includes current uncommitted working changes, not a HEAD-only archive.
The older audit's HEAD is historical context, not this candidate's identity.
[Preservation](preservation.json) confirms unchanged HEAD, empty index, intact
unrelated starting files, historical audit inputs and frozen Sift. Existing
`CONTEXT.md` and planning edits are preserved; only the Convex section of the
already-edited reliability document was revised.

[Working-file manifest](working-files.json): 195 source, generated runtime,
doctor/fixture, test, verification-script, package/config and relevant contract files.
Ordered digest is SHA-256 of the compact JSON `files` array:

`3e8e046096b16b59156f74edc458e0f74807d30519a0508ef1768249b139d07c`

Any Doctor version stays 0.1.2; Node v26.5.0. Fresh canonical tarball:

`/private/var/folders/gr/00djkpxs7ngdwdnbx719gjg80000gn/T/any-doctor-convex-modernization-vohyuuv0/review-candidate/candidate-package/any-doctor-0.1.2.tgz`

SHA-256:

`19a52b7cb2c4b8a8beae2788bb3f0bbe3ed8a1e6c36c3ab68b5c42c462c647bd`

[Package verification](package-verification.json) records build/pack from working
files, a new canonical temporary consumer, `npm ls --all --json`, and comparison
of 88 installed runtime/doctor/package files with working bytes.
Final working hashes and the tarball hash were rechecked. No old tarball or
published npx version substituted for this candidate. Evidence sidecars and this
report were generated after packing; executable identity is bound by the manifest.

## Reproduced baseline

The copied `challenges.py` is byte-identical to the original independent runner;
its execution/output directory is fresh. All 62 original sources and expectations
match the retained corpus. Labels `baseline`, `repaired-local`, and `packed` keep
results separate. JSON failure counts were checked despite the runner's zero exit
when assertions fail.

Current baseline reproduction matched the historical audit:

- Convex bundled: **97 passed / 0 failed / 0 skipped**.
- Independent: **35 / 27 / 0**, including 12 false positives and 15 missed positives.
- Frozen Sift: **110 findings**, 46 warning and 64 info.
- All 1,530 frozen file hashes/sizes and the inventory matched before scans.

The original 11 promise/clock challenges passed before the repair and remain
passing afterward. Original audit inputs and source adjudications are copied under
`raw-evidence.tar.gz:historical/`, untouched in their original directory.

## Repairs mapped to the eight defect classes

| Class | Implemented behavior and evidence boundary |
| --- | --- |
| 1. Database identity | Resolve registration/context bindings, parameter and database aliases, destructuring, direct/local handlers and config aliases. Imported context/database type contracts, local type aliases, union/Pick projections and consistent observed local helper arguments preserve useful helper findings. Unrelated db/ctx objects, shadowing, reassignment and foreign package suffixes do not establish Convex identity. Type declarations describe a contract, not runtime type proof. |
| 2. Validators | Inspect actual ordered object properties, including shorthand and renamed registration imports. Direct handlers without config are recognized. Unknown config spreads, mutations and escapes cannot prove a missing property. Public omission is a warning; internal omission is an informational optional-contract review, not client exposure. |
| 3. Context misuse | Use the same resolved context for write-in-query and db-in-action. One-line, multiline and renamed forms agree; nested ordinary bindings remain silent. Query runQuery remains permitted. |
| 4. Returned index range | Follow supported return paths, aliases and monotonic same-callback range extension. Literal unreachable branches do not establish bounds. Mixed/unmodeled returns emit an explicitly uncertain candidate for that chain. An index range never proves small cardinality. |
| 5. Runtime directives | Use the structural directive prologue. Leading comments and optional semicolons work; strings after imports are not directives. Resolve transaction registration identity and spare actions. |
| 6. Presence/spread | Establish database receiver identity and actual patch object structure, including stored values and table-qualified overloads. Only top-level object spread is a field-copy candidate; nested object/array spreads are excluded. Known dedicated heartbeats/presence table validators or explicit table arguments spare segmentation already performed. Describe validated/server-selected copies conditionally; never infer arbitrary client fields from spread alone. |
| 7. Sequential execution | Require a directly awaited runQuery/runMutation/runAction in its same-function loop. Promise-array collection and deferred nested functions are spared. Preserve retries, backoff, cursor dependence, bounded incremental work and context-specific transaction semantics in recommendations. |
| 8. Recommendations | Audited description, claim, severity, impact, why and fix together. Public API use does not imply accidental exposure. Preserve frontend callers; caller absence proves no intent. Indexed filters are potential optimizations, complete jobs must not receive arbitrary take limits, and server expiration must not be replaced by untrusted client time. All 15 checks use semantic revision 2. |

The doctor has no parser imports or text-window/brace-counting substitute.
`src/call-structure.ts` extends the existing shared calls owner with generic value,
property, binding, declared-type, return-path, loop and directive relationships.
Framework registration and API policy stay in `doctors/convex.mjs`.
See [structural call contract](../../call-structure.md) and the updated Convex docs.
No project application code is executed to infer facts.

The unrelated-package counterexample is retained in `foreign-package-before.json`:
`@other/convex/server` incorrectly produced a collect finding under the previous
suffix rule. Exact external `convex/server` recognition fixes it; the additional
suite pairs the foreign package with a real positive. `_generated/server` remains
a documented generated-module convention, not arbitrary cross-file code execution.

## Final local and packed results

Passed / failed / skipped. [Machine-readable counts](counts.json) and
[command ledger](verification.json) accompany every reported gate.

| Gate | Rebuilt working files | Fresh packed installation |
| --- | --- | --- |
| Full automated suite, including build/typecheck | 557 / 0 / 0 | Source tests not shipped |
| Convex bundled verification | 104 / 0 / 0 | 104 / 0 / 0 |
| Original independent Convex challenges | 62 / 0 / 0 | 62 / 0 / 0 |
| Additional Convex transformation/contract cases | 83 / 0 / 0 | 83 / 0 / 0 |
| All bundled doctors | 235 / 0 / 18 | 235 / 0 / 18 |
| Consumer labeled CLI regressions | 164 / 0 / 0 | 164 / 0 / 0 |
| Consumer per-export scope assertions | 84 / 0 / 0 | 84 / 0 / 0 |
| Original consumer independent suite | 29 / 1 / 0 | 29 / 1 / 0 |
| Previous consumer independent suite | 32 / 1 / 0 | 32 / 1 / 0 |
| Consumer combination suite | 12 / 0 / 0 | 12 / 0 / 0 |
| Consumer result-flow isolation | 4 / 0 / 0 | 4 / 0 / 0 |

The retained consumer failures remain exactly `mts-authored-positive` and
`inherited-cts`; their expectations were not weakened. `.cjs` diagnostic limits
are documented separately. All 18 unrelated legacy bundled skips remain skips.
Shared-call unit coverage is five tests; the additional 83 CLI cases are also
exercised by one automated integration test, not added again to the 557 total.
The all-check analysis-unavailable fixture is included in the 104 Convex total.
Build/typecheck, index preservation and `git diff --check` passed.

[Legacy fixture disagreements](legacy-fixture-disagreements.json) documents six
old author-fixture assumptions separately from the immutable independent corpus.
Five helper seeds supplied no Convex provenance; their positive replacements add
imported QueryCtx contracts while retaining the original untyped seeds as
unresolved negative controls. One misplaced directive was corrected using the
actual Convex bundler/parser contract, retaining the original seed as a negative.
The first repaired run's failures and the original 97-pass baseline remain in raw
evidence. The legitimate mutable range fixture was repaired without weakening it.

## Frozen Sift source review

[Frozen comparison](frozen-comparison.json) confirms local and installed Convex
findings are identical: **124 findings**, **40 warning / 84 info**. Relative to
baseline: **94 retained, 16 removed, 30 added**. The 16 removals are nested-object
or array spreads in explicitly named patch fields. They do not establish arbitrary
top-level field copying. The source review covers every retained, removed and added
location with excerpts and original independent adjudications:
[source-reviewed delta](source-review.json).

All four confirmed index-cleanup opportunities remain: webhook status filtering
and three timestamp-index cutoff opportunities. All 15 full-table collect
candidates remain, including billing-account reads at billing.ts:1154, :1189 and
:1214. All eight indexed-filter observations remain, including the two helper
queries in tokenUsage.ts. No production size, read latency or incident was measured.

New observations comprise 16 multiline/aliased public server calls, two separately
declared query-handler clocks, eight additional awaited run observations and four
top-level/stored patch-copy observations. These are review candidates, not 30 new
confirmed bugs. The original six retry/cursor-dependent loops remain visible with
recommendations that preserve their intended behavior. A second run call in one
QA loop is now a separate occurrence rather than being erased by the first match.

The old audit rejected 34 prescribed fixes; that was not a target removal count.
Thirty-two of those observations remain with corrected, conditional recommendations.
Required frontend consumers still rule out blanket internalization. Selected or
runtime-validated patch copies remain legitimate; their presence establishes no
mass-assignment exploit. There are no retained unconditional internalization,
client-time substitution, arbitrary billing/migration truncation or blanket
parallelization prescriptions in the revised doctor.

All 1,530 frozen files, sizes and inventory matched after scans. Live Sift was not
scanned or modified. Only framework dependency source/library functions were read
or exercised for the contract proof; no live application was run. Frozen Sift was
read-only throughout. Accepted Slop output is unchanged: **67 findings / 20 coverage
issues**, including identical messages, decision keys, snapshots and source digests.
The earlier 19 Slop export suppressions through type evidence remain unrelated to
this work and do not establish production callers.

## Framework proof and remaining limits

[Framework proof](framework-proof.json) repeats the retained Convex **1.32.0**
validator experiment: reordered and shorthand args export equivalent validators;
the direct no-validator form exports `any`. [Directive proof](directive-contract.json)
shows the after-import string is not a directive, while a leading comment and
semicolon-free prologue are valid. Current primary guidance was checked:
[validation](https://docs.convex.dev/functions/validation),
[runtimes](https://docs.convex.dev/functions/runtimes), and
[best practices](https://docs.convex.dev/understanding/best-practices/).

Version applicability is a documented current-1.x assumption, not an automatic
package-manifest compatibility gate or proof for future majors. No Convex deployment
or production workload was tested. Generator/custom wrappers, arbitrary type aliases,
cross-file untyped helpers, search indexes and split query builders remain bounded
coverage limits. `_generated/server` imports are trusted as generated contracts;
substituting unrelated implementations behind that convention is not resolved.

[Local executable gaps](local-limitations.json) and
[packed executable gaps](packed-limitations.json) retain three known missed or
unresolved observations: split builder collection, custom registration wrappers,
and a stored-then-awaited loop call. Each seed also contains a supported positive
that remains detected. These three gaps are reported separately, not counted as
correct absence or folded into the 83 passing transformation cases. Unknown index
returns, mutable/escaped configs and unavailable analysis have additional explicit
controls in the tested suites. No new false positives remain in the unchanged 62
or additional 83 cases; that is not a guarantee for unseen code or an authorization
proof. Ordinary contextual candidates may still be unnecessary optimizations.

## Independent retest

The exact package is above. Install its canonical absolute path into a fresh
consumer with `npm install --ignore-scripts --no-audit --no-fund <tarball>` and use
that installation's explicit CLI/Convex doctor paths. Do not use npx latest.

From `/Users/nickdejesus/Code/any-doctor`, create a fresh evidence directory and copy
the unchanged independent runner there:

```sh
retest_dir=$(mktemp -d /tmp/any-doctor-convex-retest.XXXXXX)
cp /private/var/folders/gr/00djkpxs7ngdwdnbx719gjg80000gn/T/any-doctor-convex-modernization-vohyuuv0/challenges.py "$retest_dir/challenges.py"
python3 "$retest_dir/challenges.py" local /Users/nickdejesus/Code/any-doctor
node dev/convex-analysis/verify-candidate.mjs "$retest_dir"
```

The verification runner rebuilds current working files, runs npm tests, bundled
verification, both Convex suites and all accepted consumer gates, packs working
files, installs a new consumer, and repeats installed verification and frozen
scanning. Its output directory must not already contain `candidate-package`.
It retains exact commands and asserts JSON counts, allowing only the two named
inherited consumer failures. For a direct retest of the retained installation:

```sh
python3 "$retest_dir/challenges.py" packed /private/var/folders/gr/00djkpxs7ngdwdnbx719gjg80000gn/T/any-doctor-convex-modernization-vohyuuv0/review-candidate/candidate-package/consumer/node_modules/any-doctor
node dev/convex-analysis/run-cases.mjs /private/var/folders/gr/00djkpxs7ngdwdnbx719gjg80000gn/T/any-doctor-convex-modernization-vohyuuv0/review-candidate/candidate-package/consumer/node_modules/any-doctor "$retest_dir/packed-extra"
node /private/var/folders/gr/00djkpxs7ngdwdnbx719gjg80000gn/T/any-doctor-convex-modernization-vohyuuv0/review-candidate/candidate-package/consumer/node_modules/any-doctor/bin/cli.js run /private/var/folders/gr/00djkpxs7ngdwdnbx719gjg80000gn/T/any-doctor-convex-modernization-vohyuuv0/review-candidate/candidate-package/consumer/node_modules/any-doctor/doctors/convex.mjs /tmp/any-doctor-frozen-sift --format json
python3 /private/var/folders/gr/00djkpxs7ngdwdnbx719gjg80000gn/T/any-doctor-convex-modernization-vohyuuv0/run-limitations.py "$retest_dir" packed /private/var/folders/gr/00djkpxs7ngdwdnbx719gjg80000gn/T/any-doctor-convex-modernization-vohyuuv0/review-candidate/candidate-package/consumer/node_modules/any-doctor
```

Original raw output root: `/private/var/folders/gr/00djkpxs7ngdwdnbx719gjg80000gn/T/any-doctor-convex-modernization-vohyuuv0`. **Final candidate gates are in `review-candidate/`.**
`baseline-*` files reproduce the old candidate. `attempt*`, the interrupted root
verification, and `final-candidate/` are superseded attempts and must not be mistaken
for final acceptance. Their tarballs, if created, remain retained separately.
`final-evidence-gates.py` reproduces JSON count, frozen, corpus, working-byte and
preservation assertions. The raw archive includes exact seeds, scan JSON, logs,
commands, framework proofs and source-review evidence, excluding installed
node_modules trees and tarballs themselves.

[Raw evidence archive](raw-evidence.tar.gz), SHA-256:

`500b50a2f5d728695f05830b122afb31c9d13e38ab983698d936782fad033cec`

**Verdict:** ready for independent review of the documented behavior on this exact
artifact; suitable for supervised source review with the stated gaps. Not accepted
for blanket automated remediation or publication on author-written tests alone.
