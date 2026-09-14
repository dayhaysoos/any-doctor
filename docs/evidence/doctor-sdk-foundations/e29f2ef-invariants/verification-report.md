# Doctor SDK invariant repair

All three requested invariants are satisfied by the local and fresh-package
checks below. This is a bounded verification verdict, not a population precision
estimate or complete JavaScript-analysis claim.

- Branch: `feature/doctor-sdk-foundations`; initial tree clean.
- Reviewed input: `cfc3bf0cea874e81ff6a3684c00cd9dfd00b8168`.
- Source repair commit: `e29f2ef7f636a2006b283aa6afc29ef2450d2a49`.
- Tarball SHA-256: `9cad3a6db601481de194b20d12dd413195061a901ceeb73c1ffe9260c4401bb4`.
- Package: 275,089 bytes, 144 files, version unchanged.
- The candidate was packed from the current working files after `npm test`
  rebuilt them. A pack after committing the repair is byte-identical.
- Every shipped tar entry was compared to its working file. Public SDK docs and
  the synthetic consumer are included; evidence and plans remain excluded.
- No reset, branch switch, push, publication or pull request occurred.

## Repair behavior

The unhandled-value recipe now establishes a non-array receiver when stable
syntax exposes an object literal's own, known custom method. Dynamic overrides,
getters, mutation, escapes and unresolved receivers remain unknown. A custom
method's return value is not inferred to be non-array merely from its receiver.

Generated lookalike profiles require complete semantic coverage for the challenged
check. The unsupported-receiver profile requires narrowed coverage and its exact
positive neighbor. Result rows retain `semantic.expected` and `semantic.actual`;
a mismatch fails independently of the missing/unexpected finding lists. The
broken control produces no lookalike findings but is rejected because its
semantic answer is narrowed. Existing positive, transfer and location expectations
remain unchanged. Option and resource identity lookalikes also require complete
coverage.

The dashboard now renders its existing zero-finding status list outside the
empty-tree-only branch. Selection and navigation still use the original finding
tree. All-zero and mixed clean/narrowed states are covered; live dashboard tests
retain the quiet doctor's status through navigation.

`checkAnalysisNeeds` is the canonical union of explicit needs and recipe-implied
capabilities. Narrowed check IDs, certification availability and runtime capability
provenance use it. `onUnknown` is required for implied requirements as it already
was for explicit needs. Recipe-only metadata no longer needs redundant `needs`.

## Verification

| Gate | Local passed / failed / skipped | Packed passed / failed / skipped |
| --- | --- | --- |
| Automated suite | 638 / 0 / 0 | source tests not shipped |
| Bundled verification | 265 / 0 / 15 | 265 / 0 / 15 |
| Recipe profiles | 21 / 0 / 0 | 21 / 0 / 0 |
| Focused regression suite | 60 / 0 / 0 | 60 / 0 / 0 |
| Separate CLI seed controls | 8 / 0 / 0 | 8 / 0 / 0 |
| Original independent cases | 55 / 0 / 0 | 55 / 0 / 0 |
| Fresh independent cases | 20 / 0 / 0 | 20 / 0 / 0 |
| Exact locations | 2 / 0 / 0 | 2 / 0 / 0 |

The 15 bundled skips are unchanged legacy skips. All three pre-existing mutation
checks reject their intended defects locally and packed. Five focused invariant
tests failed before repair and pass afterward; the separate optional-provider
baseline likewise failed generated positive profiles before implied requirements.

With `--omit=optional`, Async verification is 12 passed / 0 failed / 59 supported
skips, exit 0. The new recipe-only doctor is **2 passed / 0 failed / 6 skipped**,
exit 0: five generated analysis-on profiles skip, its explicit analysis-off
profile executes and passes, the innocent corpus passes, and its undeclared
location unit remains an explicit skip. JSON runtime output names the narrowed
check and unavailable implied capabilities (`calls`, `value-disposition`).

| Focused counterexample | Established result, local and packed |
| --- | --- |
| Synchronous native array map | No finding; no narrowing |
| Object-literal async map | Known clear; no finding or narrowing |
| Native array async map | Exact map finding |
| Unresolved receiver async map | No finding; map coverage narrowed |
| Unresolved receiver plus positive | Exact positive retained; uncertainty retained |
| Unrelated chained call | No finding; no narrowing |
| Stable fetch alias | Exact fetch finding |
| Conditional fetch alias | No finding; identity coverage narrowed |
| Mixed dashboard with quiet narrowed doctor | Narrowed doctor remains visible |
| Mixed dashboard with quiet clean doctor | Clean doctor remains visible |
| All-zero clean/narrowed dashboard | Both statuses remain visible |
| Broken lookalike doctor | Certification fails on semantic status, with zero finding differences |
| Repaired Async lookalike profile | Certification passes complete coverage |
| Recipe-only optional-provider consumer | Exit 0; analysis-on skips and analysis-off executes |

## Frozen evidence and limits

Both scans cover 671 eligible files and retain the same **9 findings**. Exact
finding and coverage projections match between local and installed-package runs.
All 1,530 manifest entries match before and after each scan; the target stayed
read-only.

Coverage occurrences are unchanged from the reviewed starting candidate:

- Fetch unresolved identity: **2,027**.
- Async-map unsupported expression: **21**.
- Fetch unsupported expression: **12**.

These are coverage occurrences, not findings or error rates. The prior report
now states that only its 39 removed fetch/unsupported-expression transitions were
individually adjudicated. Other reductions were validated with executable
controls, deterministic counts and source samples. The retained samples select
the first matching call in each of the first five affected files per category;
this convenience sample cannot estimate correctness across thousands of cases.
The earlier source-backed samples remain at `../765c29a-calibration/final-samples.json`.
No new claim of exhaustive adjudication is made in this pass.

Unresolved receivers, opaque factories/aliases, mutation and unsupported option
flow still narrow coverage. No type provider, interpreter, recipe expansion or
candidate-detection redesign was introduced. Frozen Sift's unchanged findings do
not substitute for the explicit semantic-status and optional-provider tests.

## Commands and retained proof

`evidence.tar.gz` contains sanitized stdout/stderr, command/exit records, profile
JSON/human output, optional-provider rows, independent seeds/runners, mutation
results and frozen manifests. Extract it into a fresh evidence directory.
`results.json` contains machine-readable counts and artifact identity. Raw files
and the tested tarball also remain under the task's temporary evidence directory.

```sh
npm test
node bin/cli.js verify --all
node --test test/sdk-candidate-boundaries.test.mjs test/sdk-invariants.test.mjs
npm pack --ignore-scripts --pack-destination "$OUT/package" --json
# In a fresh consumer:
npm install --ignore-scripts --no-audit --no-fund "$PACKAGE"
node "$CONSUMER/node_modules/any-doctor/bin/cli.js" verify --all
DOCTOR_CANDIDATE_ROOT="$CONSUMER/node_modules/any-doctor" node --test test/sdk-candidate-boundaries.test.mjs test/sdk-invariants.test.mjs
node dev/doctor-sdk/check-optional-provider.mjs "$PACKAGE" "$OUT/optional-consumer"
git diff cfc3bf0cea874e81ff6a3684c00cd9dfd00b8168
```

The complete implementation diff from the reviewed commit was inspected,
including generated runtime, declarations, fixtures, tests and evidence wording.
The final evidence commit is excluded from packaging; a final repack verifies
that it changes no shipped bytes.

## Every changed file

| File | Purpose |
| --- | --- |
| `bin/certify.d.ts` | Regenerated runtime or declaration matching the corresponding TypeScript implementation. |
| `bin/certify.js` | Regenerated runtime or declaration matching the corresponding TypeScript implementation. |
| `bin/contract.d.ts` | Regenerated runtime or declaration matching the corresponding TypeScript implementation. |
| `bin/contract.js` | Regenerated runtime or declaration matching the corresponding TypeScript implementation. |
| `bin/dashboard.js` | Regenerated runtime or declaration matching the corresponding TypeScript implementation. |
| `bin/doctor-sdk.js` | Regenerated runtime or declaration matching the corresponding TypeScript implementation. |
| `bin/sdk.js` | Regenerated runtime or declaration matching the corresponding TypeScript implementation. |
| `dev/doctor-sdk/check-optional-provider.mjs` | Verify a recipe-only consumer with optional dependencies omitted and assert runtime narrowing. |
| `docs/doctor-sdk.md` | Document implied requirements and maintained semantic expectations. |
| `docs/evidence/doctor-sdk-foundations/765c29a-calibration/verification-report.md` | Correct the historical verdict, exhaustive-review scope and sampling limitations. |
| `fixtures/doctor-sdk-recipe-only.fixtures.mjs` | Empty author fixture companion; maintained profiles supply challenges. |
| `fixtures/doctor-sdk-recipe-only.mjs` | Synthetic recipe-only doctor without explicit needs. |
| `src/certify.ts` | Assert maintained profile semantic coverage independently of findings; enforce implied analysis policy. |
| `src/contract.ts` | Canonical explicit plus recipe-implied requirements and semantic result-row fields. |
| `src/dashboard.ts` | Render zero-finding doctor statuses beside the selected finding tree. |
| `src/doctor-sdk.ts` | Recognize stable object literals with known custom map methods as non-array producers; preserve unresolved chains. |
| `src/sdk.ts` | Use canonical requirements for runtime capability provenance. |
| `test/dashboard.test.mjs` | Exercise mixed-status disclosure through the live dashboard navigation seam. |
| `test/sdk-candidate-boundaries.test.mjs` | Add object lookalike, native producer and unresolved receiver with positive controls. |
| `test/sdk-invariants.test.mjs` | Semantic certification rejection, implied requirements and mixed dashboard assertions. |
| `docs/evidence/doctor-sdk-foundations/e29f2ef-invariants/verification-report.md` | Bounded completion report, commands, per-counterexample verdicts and remaining limits. |
| `docs/evidence/doctor-sdk-foundations/e29f2ef-invariants/results.json` | Exact local/packed/optional counts and package provenance. |
| `docs/evidence/doctor-sdk-foundations/e29f2ef-invariants/evidence.tar.gz` | Sanitized full logs, JSON rows, executable seeds, commands and frozen integrity proof. |
| `docs/evidence/doctor-sdk-foundations/e29f2ef-invariants/changed-files.json` | Complete file-by-file change inventory and source-file digests. |
