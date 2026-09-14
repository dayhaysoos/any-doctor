# Async doctor repair: verification and independent retest

**Verdict: ready for independent retesting and supervised review, not an unrestricted
trusted default or an automatic-fix authority.** The original behavioral and location
regressions are repaired on rebuilt and installed files. Explicit abstention replaces
the unsafe reduced-analysis fallback. Known imprecision and missed candidates remain
executable below. This is implementation-authored evidence, not independent acceptance.
This repair staged, committed, pushed, published and deployed nothing. Live and frozen Sift
were read-only.

## Candidate identity

- Repository: `/Users/nickdejesus/Code/any-doctor`, branch `website/docs`.
- Starting HEAD: `b7615748884c738bf8ccc3aef06ef69daf223f02`.
- Final HEAD (context only): `2b8c937554cbe22f35a7695d38504c0ca253f244`.
- Candidate: current uncommitted working files, including accepted Convex/consumer work.
- Node `v26.5.0`, npm `11.17.0`, Any Doctor 0.1.2. No version publication.
- Doctor ID remains `async`; all three stable check IDs use semantic revision **2**.
- Doctor SHA-256: `91373d7dfaa63d24c370078c7d4f0e8eba639adb89c8439317be8147b806b7c6`.
- [Working manifest](working-files.json): 229 files; ordered digest is
  SHA-256 of the compact JSON `files` array: `fecf12c2761d6b970a5fa7fb9d7f6e1174ce5131fc4ba04a16f693e0aa7913df`.
- Fresh tarball: `/private/tmp/any-doctor-async-repair-ux7aiin9/review-candidate/platform/candidate-package/any-doctor-0.1.2.tgz`.
- Tarball SHA-256: `1796f0818b032b88f5537aab6581a89424139b25d0219e036f9ef67f631bd7bc`.

[Package verification](package-verification.json) binds 90
installed runtime/doctor/package files to working bytes, including the new value-flow
module. The tarball was built from working files and installed using its canonical
absolute path in a fresh temporary consumer. `npm ls --all --json` records dependency
versions. It is not a HEAD archive or a published npx package.

[Preservation](preservation.json) records stable candidate hashes across all final
gates, the exact starting/final HEADs, an empty index, unchanged audit inputs, frozen integrity and
preserved unrelated work. The existing Convex doctor/fixtures and consumer owner
remain byte-identical to task start. The shared call-structure owner gets an additive
projection; its existing Convex facts are retained. The earlier structural-contract
document is extended rather than replaced.

Concurrent telemetry work was removed by another operation during this task, leaving
a generated CLI import temporarily stale. Rebuilding current sources resolved that
mismatch. `concurrent-telemetry-drift.json` in raw evidence records the affected files;
those external changes are not attributed to this repair. Two unrelated commits
(`1258f24145e9279c098228add00f155b2b2053a8` and its revert
`2b8c937554cbe22f35a7695d38504c0ca253f244`) moved HEAD before final gates. Their net
tracked-tree change is empty. This repair made no commits. Final byte checks begin
after that event and show no further drift.

## Fixed baseline, reproduced before repair

The retained historical tarball was SHA-256 checked:
`3c9a124898f607e8b11d25881042635cc5352fbde579e04891a8025d4a6b7a1b`.
It was installed into `/private/tmp/any-doctor-async-repair-ux7aiin9/baseline-consumer` and exercised with unchanged copied
runners. Today's HEAD was not treated as that fixed candidate.

| Baseline gate | Passed / failed / skipped |
| --- | --- |
| Async bundled | 41 / 0 / 3 |
| Independent behavior | 22 / 33 / 0 |
| Exact location probes | 0 / 2 / 0 |
| Reduced literal receivers, six authored cases | 3 / 3 / 0 |
| Reduced named receivers, six authored cases | 2 / 4 / 0 |

The frozen baseline reproduces **18 warnings / 671 eligible files**. The audit's
classification remains three false positives, two unknowns and thirteen contextual
review candidates, with no confirmed bugs established. Original results and all
55 behavioral seeds/expectations remain unchanged. The retained corrected timer
columns **15/38** are preserved; this repair does not reopen the old hand-counted
14/36 location mistake. Command success was never substituted for JSON failure counts.

## Root causes and implementation

| Area | General repair and its boundary |
| --- | --- |
| Timer identity and cleanup | Resolve React named/renamed/namespace/default imports and native global timer calls, including qualified/static-computed calls and immutable aliases. Follow the setup's directly invoked local helpers and returned cleanup functions. Match actual lexical timer handles; reject shadowed clear functions, shadowed handles, uncalled helpers, literal dead calls and overwritten handles. A warning says no supported cancellation was established and explicitly asks for source review of opaque factories/reassignment. It does not prove a leak. |
| Promise arrays | Prove the receiver is an array using literals, declared array contracts and bounded array-producing chains. Follow the exact returned value through immutable aliases, direct returns, native combiner iterable arguments, spread elements, supported local helper parameters/results and per-element awaits. Nested arrays, array length, enclosing functions and awaiting object fields do not establish settlement. Unknown receivers, containers, method transfers and reassignment abstain. A helper that only returns an array is followed back to its caller rather than mislabeled as settlement. |
| Fetch | Resolve native global identity before applying network policy. Inspect Request constructors and ordered options/properties/spreads, including comments and static computed names. Known signals spare findings; unknown forwarded inputs/options, getters, mutation and escapes abstain. Explicit null disconnects inherited Request cancellation; undefined retains inherited evidence under dictionary conversion. Missing cancellation is an **info policy-review candidate**, with no generic component-unmount claim. |
| Reporting / reduced analysis | Every rule declares occurrence reporting, zero-based columns, full expression evidence ranges, calls analysis and `onUnknown: skip`. The unsafe name-based fallback is removed. Both JSON and prose explicitly list all three narrowed checks when unavailable, including zero-finding runs. Stable IDs remain; semantic revisions invalidate old meaning. |

The doctor imports no parser and performs no regex/brace-window semantic analysis.
`src/value-flow.ts` is a bounded generic projection behind the existing calls owner:
unique expression identities, literal/container roles, constructors, lexical
initializers, exact value uses and for-of bindings. Two nested expressions can share
a start offset without sharing a result. The platform additions have six direct
regression tests, including JSON-safe bigint/regexp handling. No target program is
executed to infer its behavior; no whole-program interpreter was added.

Recommendations now preserve the intended lifetime and ownership contract. Sequential
processing requires a loop with await inside; merely removing `async` is not a safe
repair. Timer completion can be deliberate. Signal presence does not prove anyone
will abort; missing signal does not prove a lifecycle or deadline defect.

## Final results: local and fresh installation

Passed / failed / skipped. [Counts](counts.json), [execution ledger](verification.json)
and [shared gates](source-gates.json) accompany the raw command logs.

| Gate | Rebuilt local | Fresh packed |
| --- | --- | --- |
| Full automated suite (build/typecheck included) | **565 / 0 / 0** | Source tests not shipped |
| Async bundled | **50 / 0 / 0** | **50 / 0 / 0** |
| Unchanged independent behavior | **55 / 0 / 0** | **55 / 0 / 0** |
| Unchanged location probes | **2 / 0 / 0** | **2 / 0 / 0** |
| Additional paired regression cases | **70 / 0 / 0** | **70 / 0 / 0** |
| Unavailable-analysis reporting contract | **5 / 0 / 0** | **5 / 0 / 0** |
| Original reduced literal authored expectations | **3 / 3 / 0** | **3 / 3 / 0** |
| Original reduced named authored expectations | **3 / 3 / 0** | **3 / 3 / 0** |
| All bundled doctors | **244 / 0 / 15** | **244 / 0 / 15** |

Per-rule unchanged behavioral results, identical locally and installed:
fetch **18/0/0**, map **22/0/0**, timer **15/0/0**. All three legacy Async location
skips are now exercised and pass. The 15 remaining skips belong to unrelated doctors.
Every additional case includes an unrelated positive of the same rule; broad
suppression would fail. The suite asserts actual findings, severity and distinct
coordinates, not merely fewer reports. The eight added automated tests include
six generic tests and two Async integration/reporting tests; do not add their
embedded regression cases again to the automated total.

### Reduced-analysis disagreements are not hidden passes

Both unchanged degraded runners still record **three failed authored expectations**:
`map-dropped-binding`, `map-nested-array-combiner`, `map-unrelated-scope-combiner`.
Without analysis, the new check intentionally cannot make those diagnoses. The
original expectation/result stays preserved; no source or label was rewritten.
Their inner verify commands exit **1**, although the Python wrappers exit **0**.
The raw logs also retain the new metadata's missing location witnesses; these
six-case degraded corpora cannot certify occurrence coverage. Separate five-assertion
reporting tests verify unavailable flags, all three narrowed IDs, abstention and
human-readable coverage. They test the new contract, not diagnostic recall while
analysis is absent.

[Fixture contract changes](fixture-contract-changes.json) retains twelve original
bundled rows: eight degraded-policy rows, one options row that falsely claimed a
missing signal, and three timer positives without React import provenance. Original
unbound timer seeds remain as unknown negative controls; real imported React positives
and two-occurrence witnesses are added. Original sample-app tests are also retained
in raw evidence: three fetch observations are now info, and an unknown receiver's
returned map data is not a drop proof. Sample source is unchanged. CLI gate tests now
use two genuine discarded promise arrays, preserving warning rejection coverage.

### Shared regression protection

Convex: **104/0/0** bundled, **62/0/0** unchanged independent, **83/0/0** additional,
with all **124 frozen findings unchanged**. Consumer labeled **164/0/0**, scopes
**84/0/0**, combinations **12/0/0**, result-flow isolation **4/0/0** per artifact.
The inherited consumer failures remain original **29/1/0** (`mts-authored-positive`)
and repair **32/1/0** (`inherited-cts`). Expectations were not weakened. `.cjs`
diagnostic scope is a separate limitation. Frozen Slop's **67 findings** remain
identical, including source evidence and decision keys.

## Every changed Sift finding reviewed

[Sift source review](sift-source-review.json) includes each retained, removed and
added location, before/after output, original adjudication and source excerpt.
Final local and packed scans agree on **9 findings: 1
warning and 8 informational**, with identical coverage of 671 files.
There are **7 retained, 11 removed, 2 added** locations:

- **Three corrected timer false positives:** ChatWidget.tsx:1045,
  dashboard.tsx:81 and useTypewriterCycle.ts:80 cancel their actual handles.
- **Two unknown fetch wrappers abstain:** popup.ts:1484 and :1504 forward Request/init.
- **Six contextual fetch candidates are lost through bounded input analysis:**
  resumes/$applicationId.ts:74, popup.ts:305 and :1405, extractText.ts:118,
  devApplicationFileUploadQa.ts:326 and :493. URL construction, runtime string
  guards, framework URL results and typed object fields remain unresolved here.
  These are **missed review candidates**, not corrected defects or evidence that
  cancellation exists. This recall tradeoff is a reason to retain restrictions.
- **Seven existing fetch candidates remain** with informational, context-sensitive
  guidance instead of categorical component-lifecycle warnings.
- **Two additions:** EmailSignupForm.tsx:56 is a multiline submission request;
  theme.tsx:49 is a directly invoked helper timer removing a transition class after
  animation. Both are contextual candidates. Blindly cancelling the latter could
  leave the transition class behind; deliberate completion may be the correct policy.

All 1,530 frozen file hashes, sizes and inventory match the canonical manifest
before/after. Neither live Sift nor the snapshot was edited. No production request,
browser lifecycle, customer error rate, latency or leak was measured.

## Remaining limits and recommendation

[Local](local-limits.json) and [packed](packed-limits.json) executable limit specimens
retain two missed positives/candidates (a local array type alias and a runtime string
guard), plus one unnecessary timer review candidate (a helper returns a valid cleanup
closure). Each has an unrelated positive that remains detected. These are three known
gaps, not three correct negatives or part of the 70 passing additional cases.

Other limits: cross-file helpers, arbitrary alias/type inference, mutation, custom
thenables/monkey-patched APIs, complex control flow and multi-handle timer scheduling.
A supported local consumer relationship is not proof of completion on every path.
Fetch ambiguity is handled by abstention, which loses some useful candidates.
The current reporting contract exposes global unavailable analysis and declared blind
spots; it does not emit a per-operation uncertainty record for every abstention.
A zero-finding degraded scan can still have a high numeric score, so its narrowed
fields must be respected.

Keep calls analysis mandatory, cancellation observations informational, and all
remediation supervised. **Do not call Async an unrestricted trusted default yet.**
Independent retesting of this exact artifact is still required; these results are not
permission to publish or claim 100% correctness.

Primary semantics were checked against the [Fetch Standard](https://fetch.spec.whatwg.org/#dom-request),
[ECMAScript Promise.all](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise.all),
and [React effect cleanup](https://react.dev/reference/react/useEffect).
[Executable platform proof](platform-proof.json) demonstrates Request undefined/null
inheritance, nested-array non-settlement and awaiting an object without settling its
fields under Node v26.5.0, with **zero network requests**. Historical instrumented
timer proofs remain under `historical/`; neither is a mounted React/browser test.

## Exact independent retest commands

Use a fresh output directory; runners write alongside their own source. Do not run
them in the original audit directory. From the repository:

```sh
retest_dir=$(mktemp -d /tmp/any-doctor-async-retest.XXXXXX)
cp /private/tmp/any-doctor-async-repair-ux7aiin9/challenges.py "$retest_dir/challenges.py"
cp /private/tmp/any-doctor-async-repair-ux7aiin9/degraded.py "$retest_dir/degraded.py"
cp /private/tmp/any-doctor-async-repair-ux7aiin9/degraded-identifiers.py "$retest_dir/degraded-identifiers.py"
node dev/async-analysis/verify-candidate.mjs "$retest_dir"
```

That command rebuilds/tests, invokes unchanged accepted Convex/consumer gates, packs
current working files, installs a fresh consumer, and reruns Async behavior, locations,
reduced analysis, reporting contract and frozen scans. The unchanged Convex runner
must also remain available at `/private/tmp/any-doctor-convex-audit-cv9bg365/challenges.py`.
It explicitly permits only the named inherited consumer failures and documented
reduced-analysis disagreements; it fails on unexpected JSON outcomes or byte drift.

To retest the retained artifact rather than repack current files:

```sh
consumer_dir=$(mktemp -d /tmp/any-doctor-async-consumer.XXXXXX)
npm install --prefix "$consumer_dir" --ignore-scripts --no-audit --no-fund /private/tmp/any-doctor-async-repair-ux7aiin9/review-candidate/platform/candidate-package/any-doctor-0.1.2.tgz
package_root="$consumer_dir/node_modules/any-doctor"
python3 "$retest_dir/challenges.py" packed "$package_root"
python3 "$retest_dir/degraded.py" packed-literal "$package_root"
python3 "$retest_dir/degraded-identifiers.py" packed-named "$package_root"
node "$package_root/bin/cli.js" verify "$package_root/doctors/async.mjs"
node dev/async-analysis/run-cases.mjs "$package_root" "$retest_dir/additional"
node dev/async-analysis/check-unavailable.mjs "$package_root" "$retest_dir/unavailable"
node "$package_root/bin/cli.js" run "$package_root/doctors/async.mjs" /tmp/any-doctor-frozen-sift --format json
```

The final evidence root is `/private/tmp/any-doctor-async-repair-ux7aiin9/review-candidate`. Baseline and attempt logs outside that directory
are historical/intermediate, not final certification. `/private/tmp/any-doctor-async-repair-ux7aiin9/finalize-evidence.py`
rechecks digests, preserved corpus, source comparisons, frozen integrity and the
remaining-limit specimens. Exact commands, exits, dependency inventory, seeds,
raw scans and failures are retained in [raw-evidence.tar.gz](raw-evidence.tar.gz)
(excluding installed dependency trees and tarballs). Archive SHA-256:

`09887b764b724d399443a3207c9474ee536d46658eabe0cc9b0bdcc51af5de0e`
