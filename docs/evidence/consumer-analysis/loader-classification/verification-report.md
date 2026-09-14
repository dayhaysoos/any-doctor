# Loader classification repair candidate

The three independently demonstrated loaders now preserve `src/target.ts:helper`
and still report `other/dead.ts:dead`, locally and in a fresh package. This is
implementation verification for another independent retest, not independent acceptance.

## Candidate identity

Working tree: `/Users/nickdejesus/Code/any-doctor`, branch `website/docs`.
HEAD remains `d81987b62429765b4f64fa4b8dbcbb96f10966d2` (evidence-only).
The candidate is the current unstaged/untracked working implementation, **not HEAD**.
No reset, checkout, staging, commit, push, publication, or Sift write occurred.
Existing unrelated changes, including all docs-site files, were preserved.

[Working-file manifest](working-files.json) hashes 175 source, generated runtime,
doctor, test, verification-script and package/config files. Ordered manifest digest
(SHA-256 of compact JSON serialization of its `files` array):

`e0f1619daf00939e603134a20b2779fddb784e982a0105c44e7f80f61992f528`

[Package verification](verification.json) records every command/exit status,
package/dependency provenance and comparison of 86 installed runtime/doctor/package
files against working bytes. The 175 working hashes were verified again after the gates.
[Status](status.txt) and [preservation](preservation.json) record the unchanged HEAD,
empty index, exact modified files, and preservation of unrelated working files.

Artifact (canonical path):
`/private/tmp/any-doctor-loader-repair/candidate-packed/any-doctor-0.1.2.tgz`

Tarball SHA-256:
`7514412f86fc93d22fda4f6de15ec95f0c8172de48f31182b6811f7b7be5c844`

The package was built and packed from working files, installed from its canonical
path into a new consumer, and passed `npm ls --all --json`. Version remains 0.1.2;
this is a local candidate, not a publication or either older retained tarball.
This report and final evidence sidecars were generated after packing; executable
identity is established by the manifest, not by post-pack reporting files.

## How classification now works

The implementation remains in the existing host owner, `src/project-consumers.ts`,
rebuilt into `bin/project-consumers.js`. Slop policy and duplicate comparison are unchanged.
[Repair-only diff](loader-repair.diff) isolates this round from the pre-existing implementation.

1. `runtimeExpression` strips supported runtime-transparent wrappers: parentheses,
   TypeScript assertions (`as` and angle-bracket), non-null, `satisfies`, and
   instantiation expressions. Factory expressions, initializers, callees, arguments,
   bases and property expressions share this normalization. Erased type arguments
   cannot create loader provenance.
2. Scope-manager references resolve lexical identities. An unbound identifier must
   be an actual reference before it can denote global `require`; object keys and
   declaration names are not references. `staticProperty` treats dot access and
   literal computed access consistently. Named, aliased, namespace and default
   imports from `module`/`node:module` identify builtin factories.
3. `LoaderValue` is explicit: `module`, `factory`, `loader`, `non-loader`,
   `unrelated`, or `unsupported`. A local function value is a proven non-loader.
   A value with no established loader provenance is `unrelated`, not a claim that
   its arbitrary behavior was proved harmless. An unmodeled expression containing
   loader provenance is `unsupported` with a reason; it cannot collapse into either
   ordinary category. Unknown function calls alone do not taint the project.
4. Factory identity, base identity and module target are separate. A known factory
   invoked with `import.meta.url` establishes the importer base. A literal target
   then gets target-level CommonJS uncertainty. Conditional/logical selection can
   retain a common importer base across known loaders/non-loaders, even while
   selection remains unsupported. Unknown alternatives, unsupported bases,
   reassignment, mutation and escape retain uncertainty without guessing a base.
5. The result of loading a module is not automatically another loader.
   `require.resolve` is a known non-loading filename operation; its dot/computed
   forms and aliases alone add no module-consumer evidence. Classification caches
   bound repeated initializer traversal. Any result encountering a recursive
   fallback is excluded from the cache, so cycle fallback cannot become cached
   evidence of absence.

## Verified results

Counts are passed / failed / skipped. JSON counts were checked independently of
command exit status. Full source tests are not shipped in the tarball.

| Gate | Rebuilt working files | Fresh packed installation |
| --- | --- | --- |
| Automated suite, including rebuild/typecheck | 532 / 0 / 0 | Not shipped |
| All labeled CLI cases | 145 / 0 / 0 | 145 / 0 / 0 |
| Loader per-export scope and explanation assertions | 65 / 0 / 0 | 65 / 0 / 0 |
| Original unchanged independent suite | 29 / 1 / 0 | 29 / 1 / 0 |
| Newer unchanged independent suite | 32 / 1 / 0 | 32 / 1 / 0 |
| Bundled certification | 228 / 0 / 18 | 228 / 0 / 18 |
| Slop subset | 48 / 0 / 0 | 48 / 0 / 0 |

Other bundled subsets in both environments: Async 41/0/3, Convex 97/0/0,
Effect 30/0/10, OpenRouter 12/0/5. Eighteen legacy skips remain unexercised.
Packed certification used explicit installed doctor paths; `verify --all` also
ran from the fresh consumer. No checkout-local doctor discovery substitutes for
packed verification. Build/typecheck and `git diff --check` passed.

Before the fix, all three original regressions failed with an extra helper finding
and no uncertainty. The unchanged newer independent suite reproduced 29/4/0.
Node executed the three original seeds successfully and printed `42` in each.
After the fix, the three scans return only the unrelated dead export and bounded
CommonJS uncertainty for the helper's module. The 65 additional loader cases
exercise equivalent wrappers at five expression positions, imported/local aliases,
negative object/function/shadowing controls, exact uncertainty scopes, conditional
bounds, mutation/reassignment, unknown bases, shared graphs and cycles.

- [Per-case independent before/local/packed results](independent-before-after.json)
- [All labeled outcomes and coverage explanations](labeled-summary.json)
- [Actual per-export uncertainty and evidence](candidate-scopes.json)
- [Automated test output](candidate-tests.log), [bundled output](candidate-verify.log)
- [Original regression failures](before-tests.log), [runtime witnesses](runtime-witnesses.json)
- [Complete raw evidence](raw-evidence.tar.gz): candidate local/packed JSON, scopes,
  dependency records, commands, seeds, raw scans and intermediate failed attempts.
  Extract into a fresh directory. `candidate-*` outputs are the final gates;
  intermediate files are retained for traceability, not passing candidate evidence.

Intermediate checks exposed repeated initializer traversal, overbroad handling of
`require.resolve`, and confusion between object keys and unbound references.
Those were corrected and regressed before the complete final gates above. The
superseded long-running scan/package attempt and failed package gate remain in
raw evidence; neither is represented as a final pass.

## Frozen evaluation and limits

All 1,530 frozen Sift files retain their hashes and sizes, with no extras. Live
Sift was not scanned or modified. Final local and packed output matches retained
Sift findings exactly, including messages and decision keys: **67 findings**
(32 export candidates, 35 duplicate sites), **20 coverage issues**, no crashes.
Source-digest maps and graph snapshot identity also match. There are no changed
findings requiring new source adjudication. See [frozen comparison](frozen-comparison.json).

The `.mts` failure in the original suite and `.cts` failure in the newer suite are
retained unchanged. Slop's inherited diagnostic extensions still omit `.mts`,
`.cts` and `.cjs`; reference-graph coverage does not imply diagnostic coverage.
Neither failed expectation was weakened or converted into a skip.

The earlier frozen-baseline comparison still contains 19 export suppressions
solely from type evidence, including `buildEvidencePrompt` and `buildFitPrompt`.
They do not establish production callers. Conservative template/config bounds,
unsupported loader bases and value flow can also hide genuine unused exports.
Ordinary interprocedural returns/parameters, arbitrary external loaders, and
CommonJS export assignment remain outside this bounded analysis. Namespace-object
escape can force uncertainty. These limitations do not exclude any of the three
demonstrated loader regressions, which now have bounded passing evidence.

All requested repair behaviors and verification steps were completed. Independent
acceptance remains pending; no population precision or deletion-safety claim follows.

## Reproduction

From `/Users/nickdejesus/Code/any-doctor`, use new output paths and preserve working files:

```sh
npm test
node bin/cli.js verify --all
node dev/consumer-analysis/run-cases.mjs bin/cli.js /tmp/retest-loader-labeled.json
node dev/consumer-analysis/check-loader-scopes.mjs bin/project-consumers.js /tmp/retest-loader-scopes.json
python3 dev/consumer-analysis/independent-challenges.py local /tmp/retest-original-challenges
python3 dev/consumer-analysis/independent-repair-challenges.py local /Users/nickdejesus/Code/any-doctor/bin/cli.js /tmp/retest-new-challenges
node bin/cli.js run /Users/nickdejesus/Code/any-doctor/doctors/slop.mjs /tmp/any-doctor-frozen-sift --format json > /tmp/retest-loader-sift.json
node dev/consumer-analysis/pack-working-candidate.mjs /tmp/retest-loader-package
```

The pack runner refuses existing output directories, records command statuses and
hashes, checks JSON failures, and retains exactly the inherited `.mts`/`.cts`
failures. It runs the same labeled and scope checks, both independent suites,
bundled certification and frozen scan against explicit installed paths. It never
uses `git archive HEAD` or publishes. To retest this exact artifact instead of
creating another, install the canonical tarball above into a fresh consumer and
supply that installation's CLI/graph paths to the same runners.
