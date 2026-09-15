# Convex SDK migration: blocked before production changes

The migration is **not yet acceptable**. Current Convex output can support source review, but these results do not qualify the doctor as a trusted defect detector. No production implementation, shared SDK/provider, TTY/dashboard, scoring, other doctor, version or frozen target changed.

Base: `0ace1b694077c04eb9e7d958d40cbdaf50d42883`. Branch: `feature/convex-doctor-sdk-migration`. Only Convex evaluation code and evidence were added. Final evaluation-code commit: `a09b0393b1f3496bc0b6cb4fe8735c81d180f7b0`. The exact final evidence commit and status are recorded in the handoff response; runtime/package provenance remains the foundation base. The originally requested fixture path is `doctors/convex.fixtures.mjs`, not `fixtures/convex.fixtures.mjs`.

## Why work stopped

The request says to stop when a required semantic capability does not exist, preserve executable counterexamples, and continue independent checks that fit the existing SDK. The missing capability affects all four slices: a custom Convex check cannot report its own unknown with a check ID, affected file and reason.

- `src/contract.ts:476`: `DoctorCtx.report` exposes only `finding`. There is no custom semantic-result/narrowing submission API.
- `src/sdk.ts:94`: `recordUnknown` is private. Direct semantic queries can record a capability-level unknown; recipe calls add a check ID. Neither is a truthful route for a custom Convex range/configuration/context conclusion outside those query models.
- `src/sdk.ts:261`: unavailable-provider narrowings are synthesized only for recipe declarations. `needs: ["calls"]` identifies skipped custom checks in display metadata but does not make `semantic.incomplete` true. Both `onUnknown: "skip"` and `"narrow"` fail the retained metadata experiment. Changing that field alone cannot fix the score.
- `src/summary.ts:108`: an incomplete semantic report suppresses a confident score. This task expressly excludes changing shared reporting/scoring. Calling an unrelated SDK query or declaring an inapplicable recipe just to trigger this flag would manufacture evidence.

These are two related shared prerequisites: a public, validated custom-check uncertainty reporting path; and honest unmeasured coverage for declared custom needs when the provider is absent. This report specifies required behavior, not an approved shared redesign.

Independent work completed: baseline verification, 15-check inventory, current-documentation calibration, all 124 source adjudications, 63 boundary seeds, exact-location assertions, recipe compatibility probes, an actual omitted-provider installation, and packed parity. No check can satisfy the full requested contract independently while these shared requirements remain missing. Metadata-only repair was tested and rejected. Production edits were not started.

## Results and boundaries

| Evaluation | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Baseline automated tests, including rebuild | 785 | 0 | 0 |
| Local Convex verification | 104 | 0 | 0 |
| Fresh installed Convex verification | 104 | 0 | 0 |
| All-doctor verification | 265 | 0 | 15 |
| Existing Convex adversarial suite | 83 | 0 | 0 |
| New exact-location guardrails, local | 45 | 18 | 0 |
| New exact-location guardrails, packed | 45 | 18 | 0 |
| Recipe incompatibility assertions, local/packed each | 2 | 0 | 0 |
| Desired unavailable-provider metadata contract | 0 | 2 | 0 |
| Actual omitted-provider Convex certification | 5 | 0 | 99 |

Inherited green labels were not edited. No inherited failures were observed; skips are retained separately in raw logs. Verification success is not migration acceptance. The compatibility assertions pass because the existing recipes return unsupported for the Convex inputs, not because migration works.

The 45 guardrail passes consist of a positive, ordinary registration lookalike and two exact same-line occurrences for each check. All 15 conditional imported-registration cases preserve the definite positive but silently omit uncertainty. Opaque configuration adds a 16th missing-coverage failure. Opaque index-range and unresolved API cases add two failures: both emit an extra uncertain finding instead of coverage narrowing. All 18 affected files incorrectly retain `semantic.incomplete: false` and no semantic narrowing. Expected reasons are `unresolved-identity` for registration/API identity and `unsupported-expression` for opaque range/configuration; each expected occurrence is check/file scoped.

The matrix is deliberately partial: it complements the inherited 83 adversarial cases and exact-location fixtures; it does not claim every requested wrapper, reassignment, alias, nested scope and mutation combination is newly certified. The complete slice-by-slice migration, green semantic profiles, production mutation controls and post-migration acceptance remain **not performed because blocked**. Suppressing findings cannot satisfy the positive/location controls, but no generic recipe certification is claimed for custom checks.

## Per-check verdicts and recipes

Every check retains its existing custom logic and `needs: ["calls"]`, occurrence reporting and current severity. Every check passes the three bounded controls above and fails conditional-registration uncertainty; **all 15 migrations remain blocked**. Detailed exact claims, impacts, lookalikes, capability declarations, documentation references and unsupported cases are in `check-inventory.json`.

| Check | Calibrated current meaning | Migration verdict |
|---|---|---|
| filter-table-scan | Executed unindexed filter; performance review | Blocked |
| index-without-range | Indexed collect without a proven range; opaque ranges must narrow | Blocked; extra uncertain finding reproduced |
| query-clock-reactivity | Allowed query clock read; cache/reactivity review | Blocked |
| transaction-clock-duration | Same-execution transaction clock subtraction cannot measure duration | Blocked |
| unbounded-collect | Whole-set read; growth review, preserve complete processing | Blocked |
| index-filter-combo | Valid index-plus-filter; possible optimization review | Blocked |
| presence-patch-on-shared-document | Field-name/segmentation heuristic, no measured fanout | Blocked |
| missing-args-validator | Public contract review; internal validation optional | Blocked; opaque config coverage reproduced |
| public-api-in-server-call | Namespace/intended-audience review, not an auth flaw | Blocked; unresolved API finding reproduced |
| write-in-query | Invalid write on a resolved read-only query context | Blocked |
| db-in-action | Invalid direct database use on a resolved action context | Blocked |
| unawaited-convex-call | Direct discarded context promise; no eventual-settlement claim | Blocked |
| node-runtime-transaction | Query/mutation registered in a Node-runtime file | Blocked |
| sequential-run-in-loop | Sequential server-call review; preserve retry/cursor dependencies | Blocked |
| spread-into-patch | Top-level copy review, not proof of unsafe client-controlled fields | Blocked |

No SDK recipes were adopted. `UnhandledValueRecipeQuery` requires an array receiver and async callback argument; Convex Promise-producing context methods do not fit. Required-option lookup reads argument 1 and applies request/WebIDL semantics; Convex declaration configuration and object validators are in argument 0. Both actual structured-fact probes return `unknown/unsupported-expression`. A custom rule remains appropriate for each framework-specific relationship, once the host can accept its uncertainty honestly.

## Documentation calibration

Reviewed official documentation on 2026-09-14 against the frozen dependency `convex: 1.32.0`; current docs may describe newer overloads, so this is not all-version compatibility certification.

- Index selection without a range need not restrict candidates; filter predicates can remain appropriate. A small table scan is not automatically a defect. [Indexes](https://docs.convex.dev/database/reading-data/indexes/), [index performance](https://docs.convex.dev/database/reading-data/indexes/indexes-and-query-perf).
- Transaction `Date.now()` is fixed per execution; seeded randomness is allowed. Query clocks raise reactivity concerns. Mutation `performance.now()` has different behavior and is not this rule's subject. [Runtimes](https://docs.convex.dev/functions/runtimes), [best practices](https://docs.convex.dev/understanding/best-practices/).
- Public argument validation is recommended; internal validation is optional. A server call through `api` does not establish server-only intent. [Validation](https://docs.convex.dev/functions/validation), [internal functions](https://docs.convex.dev/functions/internal-functions).
- Query contexts are read-only and actions have no direct database context. [Query context](https://docs.convex.dev/api/interfaces/server.GenericQueryCtx), [action context](https://docs.convex.dev/api/interfaces/server.GenericActionCtx).
- Action promises require consumption; sequential transaction calls can be intentional. Patch merges fields, and database-write loops inside one mutation are valid. [Actions](https://docs.convex.dev/functions/actions), [writing data](https://docs.convex.dev/database/writing-data).

## Frozen source review

All 1,530 canonical manifest entries matched before and after both scans; the snapshot was only read. Canonical manifest: `docs/evidence/consumer-analysis/sift-manifest.json`, manifest digest `336f413f63936775224d5f9c8c1f5ba9abe9a465c9ef300fba93fac3657797f2`, source snapshot HEAD `555ffb36e57a042165d3b9873b4641f31b3451f9`.

Local and packed groups are exactly equal: 671 eligible files, 124 findings, zero finding deltas, no semantic narrowings, score 97/Excellent. This is baseline behavior, not a corrected result. All 124 rows were inspected against source; `finding-adjudications.jsonl` retains file, exact location, severity, source digest, classification and rationale. The compressed evidence includes excerpts. No full source copy was added to Git.

| Check | Findings | Source-backed disposition |
|---|---:|---|
| public-api-in-server-call | 40 | Review: generated public references; client access/auth intent not established |
| query-clock-reactivity | 21 | Review: cache/time boundaries including expiry, billing and auth; preserve security checks |
| sequential-run-in-loop | 18 | Review: many retry, cursor, validation and explicitly ordered QA operations |
| spread-into-patch | 18 | Review: intentional state copy, conditional fields and selected server objects occur |
| index-filter-combo | 8 | Review: predicates observed; index/cost benefit not established |
| unbounded-collect | 15 | Review: billing/dev/backfill populations; do not truncate required complete migrations |
| filter-table-scan | 1 | Review: failed billing-webhook query; take limits result count, not all reads |
| index-without-range | 3 | Review: time-filtered maintenance collections; schema/order/workload evidence needed for a safe change |

No row was promoted to confirmed cleanup. Zero identified false positives on this snapshot is **not** a measured general precision rate: these are narrowly stated review observations, with unknown intent/cardinality deliberately retained. Source context was available for every observation; operational evidence for an actual cleanup was not. No runtime database, traffic, authorization intent or production cardinality was inspected.

## Optional provider

The fresh `npm install --omit=optional` consumer confirms `oxc-parser` absent. The doctor abstains and verification exits 0 with 5 passed / 99 skipped. But on 63 nonempty seed files, JSON and human output both advertise score 100/Excellent, alongside a provider-unavailable notice. `semantic.narrowed` is empty and `incomplete` false. This violates the requested unmeasured-population contract despite the absence of speculative findings. The controlled `skip`/`narrow` probes retain the shared blocker independently of package installation.

## Reproduction and artifacts

Run from `/Users/nickdejesus/Code/any-doctor`:

```sh
npm ci
npm test
node bin/cli.js verify doctors/convex.mjs --format json
node bin/cli.js verify --all
node dev/convex-analysis/run-cases.mjs . /tmp/convex-existing-new
node dev/convex-sdk-migration/run-guardrails.mjs . /tmp/convex-guardrails-new
node dev/convex-sdk-migration/probe-recipes.mjs .
node dev/convex-sdk-migration/repro-unavailable.mjs
```

Guardrails and unavailable metadata probes intentionally exit 1. Use a fresh output path; do not alter expected failures. Full original commands/cwds/exits are in the evidence archive and `/private/tmp/any-doctor-convex-sdk-migration`. Baseline orchestration is `baseline/run.py`. `npm test` rebuilt working runtime files. All 144 packed file payloads were compared byte-for-byte with working files before installation. No published package or `git archive` was used.

Baseline tarball: `/private/tmp/any-doctor-convex-sdk-migration/baseline/package/any-doctor-0.1.2.tgz`, 277,030 bytes, 144 files. SHA-256: `3e7fe2597e23505a6041284baaae659a1d3a91c9e754ed5ee0ad2399305369f5`. This is foundation runtime provenance, **not a successfully migrated release candidate**. Working-file digests, package receipt, full command outputs and exact failing seeds are retained with this report. No push, publication or PR occurred.

## Independent code review

### Standards

No actionable findings in `0ace1b6...bcf0ed3` or the inspected report/inventory. Candidate CLI and shared facts are used; source anchors define test locations rather than production semantics. Review confirmed package provenance and the explicit blocked verdict. The archive/final evidence commit was still being assembled; this was not an independent rerun of all suites.

### Spec

One P2 finding was identified and repaired: the first coverage oracle incorrectly required each host narrowing to contain only one file. The SDK legitimately aggregates by check/reason across files. The corrected assessor checks the target file's single occurrence and reason, and verifies aggregate counts against unique file entries. Six oracle controls pass, including acceptance of a two-file aggregate and rejection of missing findings, erased uncertainty, incorrect location/reason and inconsistent totals. These are harness controls, not production semantic mutation certification. The Spec reviewer rechecked the fix and reported no remaining actionable findings.

Both reviewers confirmed that the public SDK gap justifies the requested stop condition; no truthful supported route or independently completable check was found. Original findings: Standards 0, Spec 1 P2. Final actionable findings: Standards 0, Spec 0. The four production slices remain blocked.

## Final working-payload recheck

A second fresh pack/install in `/private/tmp/any-doctor-convex-sdk-migration/final` produced the same SHA-256, 144 files and 277,030 bytes. All payloads matched working files. Local and installed verification and frozen scans were repeated: the complete groups are equal to the original baseline, with 124 findings and all 1,530 manifest entries unchanged. This recheck establishes reproducibility of the unchanged runtime; it is not a green migration candidate. The reviewed oracle still reports 45 passed / 18 failed / 0 skipped on both working and installed payloads.
