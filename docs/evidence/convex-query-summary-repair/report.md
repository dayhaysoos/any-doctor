# Convex query-summary repair

**Corrected release verdict: acceptable with named limitations for the tested bounded static-analysis contract.** The previous verdict did not survive independent review. This focused repair addresses the reproduced failures, including the 1,000-assignment case; it does not establish whole-program correctness or automatic remediation safety.

Branch: `feature/convex-doctor-sdk-migration`.
Actual starting HEAD: `de4efe8871bc7489eca7f4923f5c20fe3cd015f9`, matching the requested candidate; working tree was clean. Recent commits and exact starting state are retained in the bundle.
Production repair commit: `505100c32c040a9a8efff3cb30fe50cd4c9bfdac`.
A separate evidence commit follows; its exact SHA is in the final handoff. No reset, checkout, history rewrite, push or publication occurred. Existing evidence remains unchanged.

## Reproductions before and after

The isolated one-file seeds, full CLI JSON, stderr, argv, exit status, score and timing were saved before production edits. The same source files were replayed locally and against the final installed package. Exact outputs are in `reproductions.json` and the bundle.

| Reproduction | Before repair | Final local and packed result |
|---|---|---|
| Opaque range plus filter | Zero findings; index-without-range unsupported-expression narrowing | Exact index-filter-combo finding at line 2, column 98; the same index-without-range uncertainty remains; null score/grade |
| Computed patch field | Zero findings and no narrowing; 100/Excellent | Zero speculative findings; one presence-patch-on-shared-document unsupported-expression occurrence in entry.ts; null score/grade |
| Spread patch | Exact spread-into-patch finding, no presence narrowing | Same spread finding at line 2, column 51 and unchanged message; one separate presence unsupported-expression occurrence; null score/grade |
| No-needs custom narrowing | Accepted, capabilities empty, incomplete=true | Rejected with exit 1 and `invalid custom narrowing: check plain must declare semantic needs` |
| Reassigned builders |160 assignments take 12.721s; 320/1000 exceed 20s | All five sizes complete at 128 MB with the same check-level result; see timings below |

The three scanner reproductions exit 0 before and after; observations and coverage are asserted independently of that status. The no-needs error is an expected negative test, not a passing doctor scan. The original scaling timeouts retain absent output as unavailable evidence rather than a zero-findings result.

## Query summarization

`createQuerySummarizer(facts, model)` constructs one private summarizer per file and returns `summarizeQueryExecution(executionCall)`. It stays inside the confined single-file doctor and introduces no imports or Effect workflow. Its result contains:

```text
convexOrigin, index, filter, range, bounded, searchIndex
execution: collect | take | first | unique | paginate
locations: index, filter, execution
```

Each semantic fact uses 0=no, 1=yes, 2=unknown. The reporting locations retain source ranges separately. Only execution/bounding operations start analysis; intermediate filter/index/builder calls are reached through those executions and do not independently trigger query-read analysis.

An origin Map caches direct adjacency lists by distinct `binding:<id>`, `value:<id>` and `call:<id>` identities. Binding initializer/write edges are computed once and reused; value aliases, choices and references lead to cached graph nodes rather than repeatedly flattening transitive histories. Index-range results are separately cached by call identity.

The explicit work queue holds a graph key and six compact facts: index, filter, range, bounded, search-index and uncertain ownership. A visited Set is keyed by graph identity plus those facts. It contains neither source histories nor historical reporting locations. Equivalent states are processed once, including when assignments cycle or reconverge. The fact domains have a fixed finite size; source histories cannot create additional state dimensions. Parsing, context resolution and range analysis still have their own costs, so these measurements are not a formal complexity guarantee for the entire analyzer.

Completed Convex-origin alternatives join field by field: yes+yes=yes, no+no=no, disagreement or an unknown remains unknown. Ordinary external alternatives make Convex ownership uncertain without inventing unrelated query operations. Shared supported evidence can remain definite across reconverging aliases. Unsupported reassignment still carries uncertainty, as in the retained small cases; the large inputs were not made green by adding a size-triggered abstention.

Index/filter reporting chooses the earliest relevant source call deterministically; the execution location remains exact. Locations do not distinguish visited states. The same-line and neighboring-positive controls assert coordinates independently from scanner output.

All four query checks evaluate the completed summary separately. In particular, range=unknown can narrow index-without-range while index=yes and filter=yes establish index-filter-combo. Unbounded-collect retains its established unindexed, unfiltered whole-set eligibility; it does not duplicate every indexed/filter review. Search-index and bounded-query exclusions remain explicit facts.

## Patch and SDK behavior

Spread observation and presence analysis are independent. Top-level spreads keep their exact existing finding/message. Presence analysis visits supported literal object fields and resolved local object spreads, tracks explicit presence fields and unknown field sets separately, and does not execute property values.

An unresolved computed key or opaque spread produces presence coverage narrowing. A neighboring explicit presence field retains its finding. Known non-presence fields remain quiet. Dedicated presence/heartbeat tables and existing validator-based segmentation can prove the shared-document convention inapplicable, so those controls remain quiet. Unknown fields do not broaden this heuristic into a claim about measured write frequency or fanout.

The SDK now requires at least one declared or recipe-implied semantic need whenever a check submits custom narrowing, even without a capability field. A supplied capability must still match a need. Validation reuses `checkAnalysisNeeds` at the existing metadata boundary, before serialization, with the existing `invalid custom narrowing` error family. All 21 previous validation/coverage tests remain; two additions cover no-needs rejection and acceptance of recipe-implied needs without an explicit needs list.

## Scaling evidence

Each case uses the same generated source before and after, `NODE_OPTIONS=--max-old-space-size=128`, and an unchanged 20-second per-case timeout. Final rows below were rerun sequentially after the concurrent full suites completed. Source bytes and all outputs are in `scaling.json`.

| Assignments | Source bytes | Measured before | Final local | Final packed |
|---:|---:|---:|---:|---:|
|20|1,123|478ms|612ms|531ms|
|80|4,063|1,741ms|475ms|468ms|
|160|7,983|12,721ms|491ms|506ms|
|320|15,823|20,017ms; timeout|586ms|603ms|
|1,000|49,143|20,021ms; timeout|1,391ms|1,347ms|

All final cases exit 0, establish zero findings, and report exactly one unresolved-identity occurrence each for filter-table-scan and unbounded-collect, scoped to entry.ts. Score/grade are null at every size. This is identical final semantic output across all five sizes, including occurrence counts. The old traversal multiplied coverage occurrences across historical filter assignments; the summary now reports the uncertainty of the executed query once per affected check.

No memory increase, timeout extension, source-size cutoff, skipped analysis or project-code execution was used. The 128 MB value limits V8 heap, not total process RSS. Peak RSS was not already available and was not instrumented. Startup and scheduling noise explain small-case timing variation. User-provided earlier approximate timings, including 40 and 120 assignments, are retained separately from measured runs.

## Complete verification

| Evaluation | Passed | Failed | Skipped |
|---|---:|---:|---:|
| npm test, including rebuild |815|0|0|
| verify --all |267|0|15|
| Convex fixtures, local / packed each |106|0|0|
| Existing adversarial cases, each |83|0|0|
| Retained guardrails, each |63|0|0|
| Retained expanded controls, each |151|0|0|
| New repair controls, each |25|0|0|
| Large scaling cases, each |5|0|0|
| SDK plus migration/repair integration tests, each |30|0|0|
| SDK-focused tests |23|0|0|
| Unavailable-metadata probes, each |2|0|0|
| Recipe incompatibility assertions, each |2|0|0|
| Provider-omitted Convex fixtures |5|0|101|

There are no inherited failures. The 15 inherited skips are Effect/OpenRouter location-coverage cases without declared reporting units. The 101 omitted-provider skips require the unavailable analysis engine.

The original 83 cases, 63 guardrails, 151 expanded cases, their harnesses and previous migration tests are byte-identical to the starting candidate; receipts are in `retained-oracles.json`. One Convex fixture expectation was strengthened: the multiline indexed/filter maintenance query retains its original index-without-range finding and now also requires index-filter-combo at line 8, column 7. No previous finding or failing expectation was removed, weakened, skipped or relabeled. This follows the newly required independent-query-check contract.

Fresh normal and optional-dependency-omitted consumers installed the same canonical tarball. The omitted-provider scan of the nonempty 63-seed project produces zero findings, null score/grade, incomplete=true and 15 analysis-unavailable checks. Human output says “No findings established — semantic coverage narrowed” and contains no Excellent grade. Existing independent checks without missing needs remain covered by the SDK contract suite.

## Frozen Sift

The 1,530 canonical manifest entries matched before and after both final scans. The snapshot was read-only throughout. Local and installed-package groups are exactly equal: 671 eligible files, 127 findings, three additions and zero removals. Every one of the 124 previous finding payloads remains unchanged.

| Added finding | Source-backed disposition |
|---|---|
| index-filter-combo, convex/orgs.ts:1002:9 | Pending-logo-upload cleanup uses by_uploadedAt index order, then a timestamp filter and collect. The original no-range observation remains. Informational review candidate; workload and complete cleanup requirements are unmeasured. |
| index-filter-combo, convex/orgs.ts:1007:9 | Pending-logo-upload-token cleanup uses by_createdAt index order, then a timestamp filter and collect. Independent filter observation was previously suppressed. Informational review candidate. |
| index-filter-combo, convex/lib/rateLimiter.ts:74:7 | Rate-limit-bucket cleanup uses by_createdAt, filter and collect before deleting old buckets. Informational review candidate; no automatic truncation or concurrency change is justified. |

Exact source excerpts, digests and classifications are in `finding-deltas.json`. The full 127-row classification inventory remains informational review candidates, with zero confirmed-defect, actionable-candidate, false-positive or unknown-finding classifications. Coverage gaps are recorded separately.

Coverage changes: spread-into-patch remains 24 unsupported-expression occurrences; presence-patch-on-shared-document rises 24→41; missing-args-validator remains 15. Total occurrences rise 63→80 across three check/reason groups. The 17 additional presence coverage occurrences are not findings. Score and grade remain null because coverage is incomplete.

## Review, package and replay

Both code-review axes inspected the focused diff, original red reproductions and all five scaling sizes. Standards: zero actionable findings. Spec: zero actionable findings. Each independently replayed the original failures and 1,000-assignment case under 128 MB. Their results and evidence paths are in `review.md` and the compressed bundle.

Canonical package: `/private/tmp/convex-summary-repair/package/any-doctor-0.1.2.tgz`.
SHA-256: `59dcf60685794d42ba3733d708240d51a0482b45555af604fcdaca81c366ba5a`.
Size: 281,904 bytes; 144 files. Version remains 0.1.2; nothing was published.
Installed CLI: `/private/tmp/convex-summary-repair/package/normal/node_modules/any-doctor/bin/cli.js`.
Installed doctor: `/private/tmp/convex-summary-repair/package/normal/node_modules/any-doctor/doctors/convex.mjs`.

Every tarball payload file was compared byte-for-byte against the rebuilt production candidate. `package-file-digests.json` hashes the payload; `working-file-digests.json` hashes every changed source, generated file, test and fixture. Exact argv/cwd/exit/timing ledgers, original seeds, red/green results, package, source excerpts and evaluator scripts are in `evidence.tar.gz`, whose checksum is in `bundle.json`. Node version was 26.5.0. System Git hit an Xcode license prompt; the already-installed `/Library/Developer/CommandLineTools/usr/bin/git` worked without changing system settings or accepting a license.

Reproduce from the production candidate using fresh output directories:

```sh
npm test
node bin/cli.js verify --all
node bin/cli.js verify doctors/convex.mjs --format json
node dev/convex-analysis/run-cases.mjs . /tmp/convex-repair-existing-new
node dev/convex-sdk-migration/run-guardrails.mjs . /tmp/convex-repair-guardrails-new
node dev/convex-sdk-migration/run-slices.mjs . /tmp/convex-repair-slices-new
node dev/convex-summary-repair/run-controls.mjs . /tmp/convex-repair-controls-new
node dev/convex-summary-repair/run-scaling.mjs . /tmp/convex-repair-scaling-new
node dev/convex-sdk-migration/probe-recipes.mjs .
node dev/convex-sdk-migration/repro-unavailable.mjs
node --test test/sdk-custom-narrowing.test.mjs test/convex-sdk-migration.test.mjs test/convex-summary-repair.test.mjs
```

For a packaged candidate, pass the installed package root instead of `.` to the harnesses, and set `DOCTOR_CANDIDATE_ROOT` for the integration tests. `evaluate.py` and `package.py` in the bundle record the actual normal/omitted installations, frozen manifests and parity assertions. No branch checkout or reset is necessary in the user's working tree.

Remaining limits: declared context types are not runtime proofs; arbitrary external wrappers, whole-program flow and workload effects are not inferred. Reassignment remains explicit uncertainty. Diagnostic scope remains .ts/.tsx/.js/.jsx/.mjs; .mts/.cts/.cjs and type-only consumer policies are unchanged. These limits do not exclude any of the reproduced defects repaired here.
