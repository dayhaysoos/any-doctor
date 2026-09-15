# Convex Doctor migration completed with bounded coverage

**Release verdict: acceptable with named limitations.** All 15 custom checks now have a validated path for reporting uncertainty. This qualifies their documented, bounded analysis for independent review; it does not qualify every finding as a confirmed defect or authorize automatic source cleanup. Nothing was pushed or published.

Branch: `feature/convex-doctor-sdk-migration`.
Production candidate: `5c1350de69c741fdbd6a4517c783436273338399`.
Continuation base: `0d69f9f0986e151ecd841872df0d705afbad9128`.
Evidence is committed separately; its exact final commit is in the handoff response. The prior blocked report and executable oracles remain unchanged.

## Shared SDK change

`DoctorCtx.report.narrowing({check,file,reason,capability?})` reuses `recordUnknown`, `SemanticNarrowing` aggregation and semantic serialization. Occurrences aggregate by check, reason and capability, with per-file counts. This is coverage information, never a finding. A definite neighbor remains a finding; unrelated checks remain unaffected.

The host validates the check identifier, its declaration in doctor metadata, structured `UnknownReason`, declared capability, normalized relative path, file existence and realpath confinement. Absolute paths, traversal, malformed segments, escaping symlinks, arbitrary fields/counts, undeclared checks and undeclared capabilities fail before result serialization.

Custom checks with unavailable declared needs now synthesize `analysis-unavailable` coverage with zero measured occurrences and no invented files. This applies to both `onUnknown: "skip"` and `"narrow"`: abstention cannot imply complete measurement. Unsupported named capabilities are unavailable even when the provider itself is installed. Independent checks without those needs continue running. Existing recipe coverage remains intact.

`semantic.incomplete` remains the canonical input to the existing partial-scan score policy: score and grade become null. There is no Convex-specific score implementation and no fabricated recipe or finding.

Convex ordinary local lookalikes remain outside its proven framework provenance. Supported imported registrations, context bindings, aliases and typed context contracts establish analysis ownership. Modeled choices, reassignment, mixed helper inputs, opaque configuration/range/patch expressions and candidate builder origins retain explicit uncertainty. Unknown provenance is never used as proof of an absent validator or safe operation. This does not infer arbitrary external wrapper implementations.

The shared checkpoint included the minimal Convex reporting adapter needed to turn the retained guardrails green. The subsequent four slices calibrated framework behavior; no further shared provider redesign was needed.

## Commits and checkpoint results

All checkpoints below passed 106 Convex fixtures, 83 adversarial cases and 63 retained guardrails, with zero failures. Full SHAs are in `summary.json`.

| Slice | Commit | Focused passed / failed | Additional evidence |
|---|---|---:|---|
| Shared prerequisite | `3cc2d049151d6b603e1324492debb8139d580559` |21 /0|806 automated;21 local and packed contract tests;2 metadata-off probes|
| A: query reads | `77aebb05929a99ff45bc12d22587aba53b5485c4` |32 /0|Stored builders, bounds, registration identity and positive neighbors|
| B: clocks/runtime | `8ed86698b10cec1d7d1d25fb111b387ea195a44a` |26 /0|Clock aliases, reassignment, mixed runtime and Node registrations|
| C: contracts | `543ccb9f4f1b23671755e840adcaf40f419c02b1` |29 /0|Context and generated API provenance, opaque contracts|
| D: async/writes | `ea3019df82417d1213426a5eb84a62907a42b830` |31 /0|Valid context promise producers, patch uncertainty|
| Review flow repair | `c023c64` |151 /0|Query context/builder choices, assignment-only origins and typed unions|
| Convergence repair | `5c1350de69c741fdbd6a4517c783436273338399` |151 /0|Four CLI integration tests, including repeated assignment under 128 MB|

Final slice matrices are A61/0, B26/0, C30/0 and D34/0. Earlier red runs remain in the bundle, including the C82/1 adversarial run that caught a reassigned-context regression before that checkpoint was committed.

**Expectation accounting:** the original 63 guardrail seeds, harness, assessment logic and unavailable-metadata probes are byte-identical to the blocked checkpoint. They moved from 45/18 to 63/0 and 0/2 to 2/0 through production changes. The original 83 adversarial seed definitions are also unchanged. Three historical range cases (`range-overwritten-unrelated`, `range-mixed-returns`, `mutation-invalidates-range`) previously expected an uncertain informational finding. An explicit `coverage-expectations.mjs` overlay now requires zero findings plus exact check/file-scoped `unsupported-expression` coverage. Their original expectations remain in source and `historicalExpected` output; this intentional contract calibration is not hidden in a total. Two unbound-API controls are preserved as negative fixtures, while generated-import variants preserve the positive locations.

## Final verification

| Evaluation | Passed | Failed | Skipped |
|---|---:|---:|---:|
| `npm test` including rebuild |810|0|0|
| All-doctor verification |267|0|15|
| Convex verification, local / packed each |106|0|0|
| Existing adversarial cases, local / packed each |83|0|0|
| Original guardrails, local / packed each |63|0|0|
| Expanded slice controls, local / packed each |151|0|0|
| Public custom-narrowing contract, local / packed each |21|0|0|
| Packed migration integration tests |4|0|0|
| Unavailable-metadata probes |2|0|0|
| Recipe incompatibility assertions, local / packed each |2|0|0|
| Provider-omitted Convex fixtures |5|0|101|
| Production mutation detection controls |2|0|0|

The 15 inherited skips concern undeclared location-reporting units in Effect/OpenRouter fixtures; there are no inherited failures. The 101 provider-omitted skips explicitly require analysis. Recipe assertions pass because neither generic array-unhandled-value nor request-option lookup models these Convex relationships; all 15 checks appropriately remain custom.

Mutation controls alter only isolated copies of the final installed doctor. Erasing narrowing yields45 passed / 18 failed. Erasing findings yields15 passed/48 failed. Neither suppression strategy can produce green acceptance.

The omitted-provider installation scans the nonempty63-seed project with analysis unavailable, zero findings,15 `analysis-unavailable` check records and incomplete=true. Score and grade are null. Human output includes “No findings established — semantic coverage narrowed” and never claims100/Excellent. The shared suite also proves that unrelated checks still report their findings.

## Per-check verdicts

Each check passes positive, innocent, alias, shadowing, unknown, definite-neighbor and exact-location controls, including two occurrences on one line. Every verdict below is **acceptable within the stated claim**, with shared analysis coverage limits retained. Full claims, metadata, counts and official references are in `check-inventory.json`.

| Check | Calibrated claim and limit |
|---|---|
| filter-table-scan | Executed unindexed filter; performance review candidate, no measured read-cost claim |
| index-without-range | Indexed collect without a proved restriction; opaque returned range becomes coverage uncertainty |
| unbounded-collect | Whole-set read candidate; preserve complete migration/billing processing unless workload evidence supports a change |
| index-filter-combo | Valid indexed read with a filter; potential optimization, not invalid Convex syntax |
| query-clock-reactivity | Global Date.now or supported alias in a query handler; cache/reactivity review, not forbidden-clock claim |
| transaction-clock-duration | Same-execution transaction Date.now subtraction; does not cover delegated clocks or arbitrary timers |
| node-runtime-transaction | Proven query/mutation registration in a Node-runtime file; uncertain registrations narrow |
| missing-args-validator | Public contract review; internal validation remains optional, opaque configuration does not prove absence |
| public-api-in-server-call | Generated public namespace in a server call; no inferred authorization flaw or client-caller absence |
| write-in-query | Unsupported write through a resolved query context; uncertain or mixed context contracts narrow |
| db-in-action | Direct database use on a resolved action context; no whole-program framework-wrapper inference |
| unawaited-convex-call | Immediate discarded result of a supported context Promise producer; no eventual-settlement claim |
| sequential-run-in-loop | Direct awaited context run call within a same-function loop; preserve retry, cursor and early-return dependencies |
| spread-into-patch | Top-level field-copy review; no claim of unvalidated client fields or mass assignment |
| presence-patch-on-shared-document | Bounded field-name/table convention; no measured write-frequency or fanout claim |

Context types are declared contracts, not runtime proofs. Methods common to a typed union remain definite; methods supported by only some alternatives narrow the relevant check. Custom registration wrappers, arbitrary type aliases, untyped cross-file helpers and whole-program value flow remain unmodeled. Diagnostic extensions remain .ts/.tsx/.js/.jsx/.mjs; .mts/.cts/.cjs coverage was not expanded. Type-only consumer suppression and frozen consumer-analysis policies were not changed. No project code is executed.

Official Convex 1.x documentation was calibrated against the frozen dependency 1.32.0; this is not all-version compatibility certification. Query contexts are read-only, mutation contexts have transactional writes, and actions expose server run calls rather than direct database access. Sources: [QueryCtx](https://docs.convex.dev/api/interfaces/server.GenericQueryCtx), [MutationCtx](https://docs.convex.dev/api/interfaces/server.GenericMutationCtx), [ActionCtx](https://docs.convex.dev/api/interfaces/server.GenericActionCtx), [StorageActionWriter](https://docs.convex.dev/api/interfaces/server.StorageActionWriter), [Scheduler](https://docs.convex.dev/api/interfaces/server.Scheduler). Earlier index/runtime/validation references remain in the preserved inventory and blocked report.

## Frozen Sift and real-source review

All 1,530 manifest entries matched before and after the final local and packed scans. The failed intermediate scan and repaired replay also left the snapshot intact. Frozen snapshot HEAD: `555ffb36e57a042165d3b9873b4641f31b3451f9`; canonical manifest SHA-256: `336f413f63936775224d5f9c8c1f5ba9abe9a465c9ef300fba93fac3657797f2`.

Final results: 671 eligible files, 124 findings, identical local and packed groups. All 124 finding payloads, messages, exact locations and source digests match the retained baseline; **zero final finding deltas**. Every finding is classified as an **informational review candidate**. Confirmed defects 0, actionable candidates 0, false positives 0, and unknown findings 0. This reflects the source-backed review limits, not a claim that each underlying behavior should change. Coverage uncertainty is recorded separately from findings.

The first intermediate candidate lost `sequential-run-in-loop` at `convex/chat.ts:341:33`. Source shows `ctx: QueryCtx | MutationCtx` and an awaited runQuery with early return and catch/continue. Both alternatives support runQuery. That loss was a scanner regression, not improvement; the final implementation restores the exact candidate and preserves its ordered-lookup interpretation.

The final scan records 24 `spread-into-patch`, 24 `presence-patch-on-shared-document`, and 15 `missing-args-validator` unsupported-expression occurrences. Opaque field construction and registration configuration do not justify definitive findings or absence claims. These 63 occurrences aggregate into three check/reason records across affected files. The final score/grade are null, replacing the baseline 97/Excellent because coverage is now honestly incomplete.

The initial branching implementation passed fixtures but exhausted the default heap on frozen Sift. A minimized nine-assignment real-CLI test reproduced the failure at 128 MB. The final traversal merges states with the same classification evidence rather than enumerating path permutations; no arbitrary cutoff was introduced. The retained regression passes in 451 ms at 128 MB, and independent 20-assignment replay passes in 464 ms. Final full scans took 6,172 ms local and 6,130 ms packed with normal settings. These observations do not establish constant cost for arbitrary source. The OOM and both reviewer-repair cycles remain documented in `review.md` and the bundle.

## Artifact and reproducibility

Freshly rebuilt package: `/private/tmp/convex-sdk-continuation/candidate-3/package/any-doctor-0.1.2.tgz`.
SHA-256: `4552632c4dcfe99c7e7a9945dd79b4ae0dad96d867350aa3059177f914fd723f`.
Bytes: 281,040. Packaged files: 144. Version remains 0.1.2; no release was published.
Installed CLI: `/private/tmp/convex-sdk-continuation/candidate-3/consumer/node_modules/any-doctor/bin/cli.js`.
Installed doctor: `/private/tmp/convex-sdk-continuation/candidate-3/consumer/node_modules/any-doctor/doctors/convex.mjs`.

`npm pack --ignore-scripts` ran after the successful rebuild; every packed file was compared byte-for-byte with the working candidate. That canonical tarball path was installed into fresh normal and `--omit=optional` consumers with lifecycle scripts disabled. `package-file-digests.json` hashes every payload file; `working-file-digests.json` hashes every changed source, generated file and test relative to the continuation base.

Reproduce from the production candidate in a separate review environment; no checkout/reset is needed in the user's working tree:

```sh
npm test
node bin/cli.js verify --all
node bin/cli.js verify doctors/convex.mjs --format json
node dev/convex-analysis/run-cases.mjs . /tmp/convex-review-existing-new
node dev/convex-sdk-migration/run-guardrails.mjs . /tmp/convex-review-guardrails-new
node dev/convex-sdk-migration/run-slices.mjs . /tmp/convex-review-slices-new
node dev/convex-sdk-migration/probe-recipes.mjs .
node dev/convex-sdk-migration/repro-unavailable.mjs
node --test test/sdk-custom-narrowing.test.mjs test/convex-sdk-migration.test.mjs
```

Use a fresh output directory for each harness invocation. For the installed package, replace the candidate argument `.` with the installed package root. For integration tests, set `DOCTOR_CANDIDATE_ROOT` to that root. `final-evaluate-3.py` in the bundle records the full local/packed/omitted sequence, exact argv/cwd/exit/time ledgers, manifest verification and payload comparisons. `summary.json` contains machine-readable failure/skip counts. Raw source excerpts, red/green results, seeds, original request, tarballs and command logs are compressed in `evidence.tar.gz`; the bundle digest is in `bundle.json`.
