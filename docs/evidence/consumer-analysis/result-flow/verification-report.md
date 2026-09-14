# Conditional-loader result-flow verification

The repair passes the requested behavior checks against rebuilt working files and
a fresh packed installation. This is implementation-authored verification for
independent review, not independent acceptance or a precision estimate.

## Candidate and preservation

Repository: `/Users/nickdejesus/Code/any-doctor`, branch `website/docs`.
HEAD remains `d81987b62429765b4f64fa4b8dbcbb96f10966d2` (evidence-only).
The candidate is **uncommitted working files**, not HEAD. No reset, checkout,
staging, commit, push, or publication occurred. Existing unrelated edits and all
old evidence remain intact. Only five existing files changed in this repair:
`src/project-consumers.ts`, its rebuilt `bin/project-consumers.js`,
`dev/consumer-analysis/loader-cases.mjs`, `pack-working-candidate.mjs` in the same
directory, and `docs/project-consumer-analysis.md`. Three new executable test files
add the result-flow cases and reusable copies of the two independent scripts.
Slop's policy and source are unchanged.

The supplied 175-file starting manifest matched without drift before source edits:
`e0f1619daf00939e603134a20b2779fddb784e982a0105c44e7f80f61992f528`.
[Preservation](preservation.json) verifies unchanged HEAD/branch, empty index,
unrelated starting file hashes, and the unchanged previous tarball.
The full starting snapshot is in `raw-evidence.tar.gz:starting-state.json`.

[Current working manifest](working-files.json): 178 files, SHA-256 of compact
JSON serialization of the ordered `files` array:

`8bdcd681b199846ac82956399ce94df9adfe2a61ad8896e774eddd23765592f9`

Fresh artifact, version 0.1.2, Node v26.5.0:

`/private/tmp/any-doctor-result-flow-repair/candidate-packed/any-doctor-0.1.2.tgz`

Tarball SHA-256:

`fda8e7570a5fa669317695ff6675dfffb0ff1c4ce6dc748c1759d27306186dbe`

[Package verification](package-verification.json) records build, pack, canonical
fresh installation, `npm ls --all --json`, commands/statuses and comparison of
86 installed runtime/doctor/package files against working bytes.
All 178 working hashes matched again after verification. This report and final
evidence sidecars were written after packing; the manifest binds executable
identity, not post-pack reporting files. The prior artifact remains available at
`/private/tmp/any-doctor-loader-repair/candidate-packed/any-doctor-0.1.2.tgz`,
SHA-256 `7514412f86fc93d22fda4f6de15ec95f0c8172de48f31182b6811f7b7be5c844`.

## Corrected semantics

[Repair-only source diff](result-flow-repair.diff) compares against the saved
starting working source, isolating this change from earlier uncommitted work.
The defect was the unconditional transfer of an unsupported callee's identity to
its return value. Conditional-loader module methods then appeared to be another
loader call without a target argument, causing project-wide uncertainty.

`LoaderValue` now represents `loaded-value` explicitly. Unsupported provenance
also carries a possible callable role: `factory`, `loader`, or `unknown`.
Conditional/logical alternatives establish a role and common importer base only
when their classifications justify it. Calling a factory produces a loader;
calling a recognized or uncertain loader produces a loaded value. The original
load independently records target uncertainty in the AST walk. Arbitrary methods
on its direct or stored result do not inherit loader identity, including aliases
and supported transparent wrappers. There is no method-name special case.

Conditional factory selection remains capable of creating a loader, so its later
load still preserves the consumed target. Factory creation alone is not a module
load. Unknown loader-related callees retain unsupported result flow; unsupported
bases, mutation/reassignment and unmodeled wrappers still expose uncertainty.
Arbitrary member access cannot inherit a known callable role without evidence.
A proven local ordinary function remains `non-loader`; an unknown expression
without loader provenance remains `unrelated`, a distinct classification from
incomplete loader analysis. The implementation stays in the existing host owner;
no project code is executed during analysis.

## Before and after

All four independent isolation seeds were reproduced before changing source,
against starting local files and the retained previous packed installation.
Both passed 2/4: direct conditional loading and ordinary-loader method access
were bounded; direct and stored conditional module-method calls suppressed the
unrelated dead export and marked both files uncertain. All eight runtime witnesses
exited zero. The original combination suite reproduced 11/12 locally.

After repair, **4/4 isolation cases pass in each environment**. Every case reports
exactly `other/dead.ts:dead`, preserves `src/target.ts:helper`, gives uncertainty
only to `src/target.ts`, and leaves the dead export's evidence empty. All eight
runtime witnesses again exit zero; module-method cases print `42`.
The combination suite passes **12/12** in both environments, with all ten
executable runtime witnesses passing in each. The four original seeds, all
combination seeds, and original/previous independent expectations were retained.
[Seed preservation](seed-preservation.json) records equality for 30, 33 and 12
cases. Copies of independent scripts differ only in execution/output paths and
associated argument handling; the diffs are in raw evidence.

[Before/after findings and uncertainty](before-after.json) contains every isolation
row. [Local per-export evidence](local-result-flow-scopes.json) and
[packed per-export evidence](packed-result-flow-scopes.json) cover all 19 result-flow
cases: four independent seeds plus 15 neighboring syntax/role controls. These
assert actual findings, exact affected export scopes and coverage explanations.
They cover direct/stored/computed methods, a different method name, aliases,
destructuring, wrappers, logical/nested selection, conditional factories,
factory creation without loading, unknown bases/alternatives/wrappers, and
ordinary local or unrelated unknown calls. Every bounded consumer case includes
an unrelated unused export and requires it to remain reported.

## Final gate counts

Counts are passed / failed / skipped; [JSON counts](verification-counts.json) were
asserted separately from successful process exits.

| Gate | Rebuilt working files | Fresh packed installation |
| --- | --- | --- |
| Automated source suite including build/typecheck | 551 / 0 / 0 | Source tests not shipped |
| Labeled CLI suite | 164 / 0 / 0 | 164 / 0 / 0 |
| Host per-export scope/explanation suite | 84 / 0 / 0 | 84 / 0 / 0 |
| Original independent suite | 29 / 1 / 0 | 29 / 1 / 0 |
| Previous repair independent suite | 32 / 1 / 0 | 32 / 1 / 0 |
| Independent combination suite | 12 / 0 / 0 | 12 / 0 / 0 |
| Independent result-flow isolation | 4 / 0 / 0 | 4 / 0 / 0 |
| Bundled certification | 228 / 0 / 18 | 228 / 0 / 18 |

Bundled subsets: Slop 48/0/0, Async 41/0/3, Convex 97/0/0,
Effect 30/0/10, OpenRouter 12/0/5. Packaged tests use explicit installed CLI and
doctor paths. Bundled discovery also ran from the fresh consumer directory.
The 18 legacy skips remain unexercised. `git diff --check` passed.
An intermediate TypeScript narrowing error is retained in `build.log`; it was
corrected before the successful final build and complete gates. Early focused
results alone were not accepted as final verification.

## Frozen Sift and remaining limits

[Frozen manifest before](frozen-before.json) and [after](frozen-after.json) match
all 1,530 files' hashes and sizes, with no missing or extra files. Live Sift was not
scanned or modified. Frozen Sift was only read. [Output comparison](frozen-comparison.json)
confirms both scans match the retained output: **67 findings** (32 exports,
35 duplicate sites), **20 coverage issues**, no crashes or broken doctors.
Every finding, message, decision key and coverage field other than duration
matches, including source digests and graph snapshot. No changed findings need
source adjudication.

The original `mts-authored-positive` and previous `inherited-cts` expectations
still fail unchanged. They were neither weakened nor converted into skips.
Slop does not diagnose `.mts`, `.cts` or `.cjs` exports even though the host graph
can inspect references in those files; the `.cjs` limit is separate from the two
executable inherited failures. The earlier 19 export suppressions caused solely
by type evidence remain a precision/recall tradeoff, not discovery of production
callers (including `buildEvidencePrompt` and `buildFitPrompt`).

Unsupported loader bases, mutated/escaped identities, genuinely unknown
loader-related flow and dynamic/config resolution limits can still conservatively
hide unused exports. Ordinary interprocedural returns/parameters, arbitrary
external loaders and CommonJS export assignment are not interpreted. These limits
do not exclude the direct/stored conditional-loader reproduction fixed here.

## Reproduce and inspect

Executable seeds/runners are in `dev/consumer-analysis/result-flow-cases.mjs`,
`independent-combination-challenges.py`, and `independent-result-flow-isolation.py`.
Run from `/Users/nickdejesus/Code/any-doctor` using fresh output paths:

```sh
npm test
node bin/cli.js verify --all
node dev/consumer-analysis/run-cases.mjs bin/cli.js /tmp/result-flow-review-labeled.json
node dev/consumer-analysis/check-loader-scopes.mjs bin/project-consumers.js /tmp/result-flow-review-scopes.json
python3 dev/consumer-analysis/independent-challenges.py local /tmp/result-flow-review-original
python3 dev/consumer-analysis/independent-repair-challenges.py local /Users/nickdejesus/Code/any-doctor/bin/cli.js /tmp/result-flow-review-previous
python3 dev/consumer-analysis/independent-combination-challenges.py local /Users/nickdejesus/Code/any-doctor/bin/cli.js /tmp/result-flow-review-combination
node dev/consumer-analysis/pack-working-candidate.mjs /tmp/result-flow-review-package
```

The pack runner refuses existing output directories, runs every packaged gate,
and runs all four isolation cases against both local and its fresh installation.
It asserts JSON failure counts and allows only the two named inherited failures.
To rerun isolation against this exact artifact's retained fresh installation:

```sh
python3 dev/consumer-analysis/independent-result-flow-isolation.py /tmp/result-flow-review-isolation /private/tmp/any-doctor-result-flow-repair/candidate-packed/consumer/node_modules/any-doctor
```

Original raw results remain at `/private/tmp/any-doctor-result-flow-repair`:
`before-isolation/result-flow-isolation.json`, `before-combination/`,
`local-combination/`, `local-scopes.json`, `candidate-packed/loader-scopes.json`,
`candidate-packed/isolation-review/`, and each original/previous suite's raw scans.
`local-commands.json` and `candidate-packed/verification.json` give commands and
statuses. `candidate-tests.log` is the full source-suite output.
`final-gates.py` reproduces the JSON, artifact, preservation and frozen assertions.

[Raw evidence archive](raw-evidence.tar.gz) retains logs, JSON scans, executable
seeds, script diffs, starting source/manifest, dependency records and gate scripts.
It excludes the installed node_modules tree and tarball; those remain at the
canonical paths above. Extract into a fresh directory for inspection. Archive SHA-256:

`50149e6af6f84b4d90f6d87bcbf08aaa10c2d382cdcc2ef6dbeac5bcc9c60c58`
