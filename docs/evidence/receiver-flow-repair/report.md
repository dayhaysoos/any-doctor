# Receiver-flow repair verification

**Verdict: the tested inline and nested receiver families now retain definite findings or expose scoped uncertainty, without tainting the unrelated controls.** This is evidence for independent review of the bounded analyzer, not a publication or automatic-remediation claim.

- Branch: `feature/convex-doctor-sdk-migration`.
- Starting HEAD: `26be42bf1ef7b5cb28fc8fb9f04c984ad2d5e44d`; the working tree was clean.
- Production commit: `9cccabb957f96f3ce8edb06cf214877633929b05` (13 files, 446 insertions, 50 deletions).
- Evidence commit: the separate commit containing this report. Its exact SHA is supplied in the final handoff and external final verification report; a commit cannot embed its own hash. Resolve it with `git log -1 --format=%H -- docs/evidence/receiver-flow-repair/report.md`.
- No reset, checkout, history rewrite, push, publication, or frozen-target modification occurred.

Exact changed files and their SHA-256 values are in [working-file-digests.json](working-file-digests.json). All existing Convex fixtures, independent seeds, guardrails and expectations remain byte-identical; see [retained-oracles.json](retained-oracles.json). There are no weakened or removed expectations.

## What changed

`CallInfo.receiverValue` links every modeled member call to an ID in `CallStructure.flow.values`. The existing graph already distinguishes expressions that share a source start. The link is not a source offset, call-end identity or declaration-binding identity. `receiverCall` remains available for older consumers. Transparent wrappers share their runtime value's graph identity.

The provider now also retains sequence and assignment result relationships, literal logical short-circuit selection, array source slots (including holes), and assignment destinations through optional `targetValue` flow IDs. Member writes keep the old `binding` field absent: mutating an object's member does not pretend to reassign the object's binding. No AST or framework-specific interpretation is exposed.

The Convex summarizer traverses those shared facts. It indexes binding writes, member mutations and return values, caches direct graph edges, and uses a work queue with visited semantic states. Binding, flow, call, returned-function and global-container identities occupy distinct namespaces. Unbound globals do not share `binding:null` as an identity.

The outcomes are explicit in the summary:

1. Supported paths reaching the registered Convex query root establish candidate membership and their proven query operations.
2. Traversal with no visible Convex connection remains outside scope. Ordinary calls and unrelated global/property controls produce neither findings nor narrowing.
3. A mixed or unsupported path with visible Convex provenance retains candidate membership and yields unknown check decisions. Getters, constructors, opaque wrappers and unsupported projections use bounded source facts without asserting that their output equals their input.

Each check is evaluated on a complete supported path before results are joined. Agreement preserves the decision; disagreement becomes unknown. This avoids manufacturing an index-plus-filter relationship from a filter-only alternative and an index-only alternative. A known index/filter result can still be reported while range uncertainty narrows index-without-range. A foreign alternative cannot become definitely Convex.

Locations are deterministic operation ranges, kept outside visited-state keys. Historical paths do not multiply coverage occurrences. The earlier registration-candidate walk now shares visited identities across reconverging alternatives; the initial 80-level case timed out before that repair. Neither traversal builds a list of path permutations.

## Contract compatibility

Protocol, semantic-result and syntax-flow provider versions remain **1**. The additions are optional fields on existing serializable records; existing fields, ID domains, result envelopes, capabilities and provider identity remain unchanged. Sequences and logical expressions use existing value kinds. Correcting previously incomplete fact inference does not require incompatible decoding. Packed execution, existing doctors and SDK suites verify that compatibility. Check meanings and authored semantic revisions are unchanged: this repairs recognition of the existing claims rather than defining different claims. Package version remains `0.1.2`; nothing was published.

## Before and after

The exact user seed is retained as [original-seed.ts](original-seed.ts). [reproduction.json](reproduction.json) records actual commands, exit statuses, full narrowing records and score/count summaries; full JSON and stderr are in the executable bundle.

| Candidate | Exit | Findings | Narrowing | Score / grade |
|---|---:|---:|---|---|
| Starting local files |0|0|none|100 / Excellent|
| Retained previous package |0|0|none|100 / Excellent|
| Rebuilt final files |0|0|index-without-range and index-filter-combo, one occurrence each in entry.ts|null / null|
| Fresh installed package |0|0|identical to rebuilt files|null / null|

The retained previous package was verified against SHA-256 `59dcf60685794d42ba3733d708240d51a0482b45555af604fcdaca81c366ba5a` before installation. No published `npx` package was used. The shared receiver contract test was run red before the production change, then green afterward.

The final 59-case matrix asserts findings and their exact line/column independently from narrowing check/reason/file/occurrence expectations. Uncertain forms carry an unrelated definite positive. Isolated mixed, nested and method-wrapper scans additionally assert zero speculative findings and null score/grade; an isolated ordinary receiver stays quiet. The matrix includes casts, satisfies, non-null, type assertions, choices, all three logical operators, reassignment, mutation, wrappers, containers, getters, sequence results, global identity controls, and correlation checks. The 26 shared tests inspect graph links directly, including deterministic JSON serialization, cycles, aliases, dead alternatives, holes and member-write destinations.

## Verification counts

Counts below are passed / failed / skipped. Command success alone was not treated as fixture success. Machine-readable counts are in [verification.json](verification.json).

| Suite | Rebuilt local | Fresh package |
|---|---:|---:|
| Full npm test, including rebuild |843 / 0 / 0|—|
| Bundled verification |267 / 0 / 15|267 / 0 / 15|
| Convex fixtures |106 / 0 / 0|106 / 0 / 0|
| Existing independent cases |83 / 0 / 0|83 / 0 / 0|
| Guardrails |63 / 0 / 0|63 / 0 / 0|
| Expanded slices |151 / 0 / 0|151 / 0 / 0|
| Previous summary-repair controls |25 / 0 / 0|25 / 0 / 0|
| Receiver matrix |59 / 0 / 0|59 / 0 / 0|
| Shared receiver contract |26 / 0 / 0|26 / 0 / 0|
| SDK and integration tests, including receiver tests |58 / 0 / 0|58 / 0 / 0|
| Assignment scaling |5 / 0 / 0|5 / 0 / 0|
| Receiver-depth scaling |8 / 0 / 0|8 / 0 / 0|

No inherited failures remain. The 15 inherited skips are Effect/OpenRouter location-coverage cases with undeclared reporting units. A separate installation omitting the optional parser passes 5 Convex fixtures and skips 101 analysis-required fixtures; this is distinct from full-provider acceptance. Existing recipe and unavailable-metadata probes also pass locally and from the package.

## Bounded growth

Sequential final measurements use a 128 MB V8 heap and the unchanged 20-second per-scan timeout. Full commands, source bytes/graph sizes, outputs and semantic assertions are in [scaling.json](scaling.json).

| Assignments | Local ms | Packed ms |
|---:|---:|---:|
|20|714|557|
|80|499|605|
|160|535|554|
|320|679|682|
|1,000|1954|1762|

Every assignment size retains zero findings and exactly one narrowing occurrence each for filter-table-scan and unbounded-collect, with null score/grade.

| Depth | Alias graph values | Alias local / packed ms | Nested graph values | Nested local / packed ms |
|---:|---:|---:|---:|---:|
|10|113|554 / 470|102|565 / 460|
|20|183|513 / 476|152|499 / 459|
|40|323|485 / 453|252|521 / 536|
|80|603|589 / 492|452|520 / 482|

Alias paths preserve two definite findings. Nested mixed paths retain two narrowing occurrences and the independent positive. Graph values grow linearly in these families. Visited keys contain only graph identity and seven finite fact components, not paths or reporting history. These measurements do not claim a complexity proof for every parser, range callback or arbitrary program. The heap limit is not a total-RSS measurement.

## Frozen Sift

All 1,530 manifest entries matched before and after both local and packed scans; receipts and the manifest digest are in [frozen-manifest.json](frozen-manifest.json). The target was used only as a read-only scan/source-inspection input. Existing snapshots and evidence were preserved.

Exact comparisons include rule, file, line, column and message. Local and packed groups, counts, score and narrowing are identical. [frozen-sift.json](frozen-sift.json) contains the source excerpts and adjudications:

- **127 prior findings preserved; none removed.** Their prior adjudications are retained by reference and digest.
- **One added informational review candidate:** index-filter-combo at `convex/applications.ts:1481`, column 7. Both onlyActive alternatives derive from an indexed query that already filters drafts. This is a legitimate newly reachable observation, not proof that production cardinality requires remediation.
- **Two added unknown coverage occurrences:** index-filter-combo in the same file, at the conditional filter operations on lines 1683 and 1710. One path has a filter and the other does not. No definite finding is invented.

Final findings: 128 (40 warning, 88 info). Existing spread/presence/args narrowing remains unchanged at 24/41/15 occurrences. Index-filter coverage adds two, for 82 total occurrences across four records. Score and grade remain null.

## Package provenance and retesting

Canonical tarball: `/private/tmp/any-doctor-receiver-repair/package/any-doctor-0.1.2.tgz`.

SHA-256: `7040985e7e4d71c06195997f76414b4cd81dfb1601ae9fe25880de7be46770a8`.

Size: **283,777 bytes; 144 files**. Every payload file was compared byte-for-byte to the working candidate and checked again against the production commit. [package.json](package.json) gives exact installed CLI/doctor paths; [parity.json](parity.json) records the comparisons.

From `/Users/nickdejesus/Code/any-doctor`, the retained orchestration commands were:

```sh
PATH=/Library/Developer/CommandLineTools/usr/bin:$PATH npm test
PATH=/Library/Developer/CommandLineTools/usr/bin:$PATH node bin/cli.js verify --all
python3 /private/tmp/any-doctor-receiver-repair/evaluate.py accepted-local
python3 /private/tmp/any-doctor-receiver-repair/evaluate.py accepted-packed /private/tmp/any-doctor-receiver-repair/package/normal/node_modules/any-doctor
python3 /private/tmp/any-doctor-receiver-repair/check-parity.py
```

`evaluate.py` retains exact argv, exit status, cwd, full stdout/stderr and timings for every requested Convex runner, JSON bundled verification, receiver matrix, shared contract tests, depth/assignment scaling and frozen scan. It uses the CommandLineTools Git first on PATH. Choose new output names for reruns. To retest only the new boundary:

```sh
node dev/receiver-flow/run-cases.mjs . /private/tmp/receiver-independent-fresh
DOCTOR_CANDIDATE_ROOT=/private/tmp/any-doctor-receiver-repair/package/normal/node_modules/any-doctor node --test test/receiver-flow.test.mjs test/convex-receiver-flow.test.mjs
```

The [executable bundle](executable-evidence.tar.gz) retains the tested tarball, all command receipts, original/red outputs, final outputs, executable seeds and independent review counterexamples. Its digest is in [bundle.json](bundle.json). Installed node_modules are excluded.

## Standards review

Final actionable findings: **0**. Review caught and verified repairs for unbound identity collisions, container projection loss and unrelated-property taint. The final independent standards matrix passes 59 / 0 / 0. Optional fact fields preserve contract compatibility.

## Specification review

Final actionable findings: **0**. Review independently reproduced and verified fixes for container, sequence, member-write and getter provenance loss. Its last full matrix passes 56 / 0 / 0; the subsequent three global-identity controls pass in the final 59-case local/packed and standards runs. [reviews.json](reviews.json) identifies retained evidence. No scope or expectation was weakened to obtain those results.

## Remaining limits

Opaque transformations, runtime getter behavior, dynamic properties and mutation ordering are not interpreted as definite result identity. Where the reviewed shared graph contains visible Convex provenance, they retain candidate membership and scoped uncertainty. Arbitrary interprocedural or cross-module return transformations, runtime reflection, proxies and generated code execution are outside this bounded model; project code is never executed to resolve them. A missing external connection is not proof of whole-program absence.

The existing `.mts`/`.cts`/`.cjs` diagnostic limits, test/generated scope, custom ownership limits and type-only suppression tradeoffs are unchanged and separate from this receiver repair. Unsupported range callbacks still narrow independently. Findings remain supervised review candidates. The demonstrated inline conditional is fixed and is not listed as an accepted limitation.
