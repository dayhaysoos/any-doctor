# Final Doctor SDK invariant repair

All three requested invariants are satisfied by the checks below. This is a
bounded implementation and artifact verdict, not a population precision estimate.

## Provenance

- Branch: `feature/doctor-sdk-foundations`.
- Reviewed start: `a93313f3ddef2b69f50d8cf2072a323d979ebdf9`, initially clean.
- Source candidate: `50efeab5303b622e5d00a2b48878001b0022e8d1`.
- Implementation commits: `102b4e3` and `50efeab` (short-terminal review correction).
- Evidence is retained in a separate local commit; it is excluded from packaging.
- Package: `any-doctor-0.1.2.tgz`, **275,907 bytes**, **144 files**.
- SHA-256: `a6182897ff0b59a55f078c3c370d1984339723cd0b094cd7951c8b7aa5eb7792`.
- Raw final package location: task evidence root, `final/package/any-doctor-0.1.2.tgz`.
- The package was made from current working files after rebuilding, using
  `npm pack --ignore-scripts --pack-destination <fresh-directory> --json`.
  Every shipped tar entry matched its working file. Final-commit repacking is
  checked separately and must remain byte-identical.
- No reset, branch switch, push, publication or pull request occurred.

## Red evidence before implementation

The three areas were represented before any implementation edit. The initial
focused run was **48 passed / 12 failed / 0 skipped**. The baseline package used
the reviewed product bytes with the new synthetic reporting-unit fixture.

| Area | Expected baseline failure |
| --- | --- |
| Recipe-only location skip | `requires a passing positive fixture for this check`; fresh omit-optional install exits 1 although the author fixture and five profiles skip. |
| Off-only location witness | `off-only location witness must fail certification`: actual exit 0, expected 1. |
| One quiet doctor | `every repaint stays rows - 1`: actual 34, expected 33. |
| Five quiet doctors | Actual 38, expected 33. |
| Forty quiet doctors at 14 rows | Actual 53, expected 13. |
| Missing profile classifications | Option-family actual includes undefined instead of complete/narrowed. |
| Semantic mutation gate | Four controls were incorrectly accepted: option complete, resource complete, resource known-report and omitted expectation. Finding projections still matched. |

The code-review follow-up also began red: **10 passed / 5 failed**. At 10 rows,
quiet summaries disappeared; at 8 rows navigation/height failed; with notices,
a 3-row request rendered 10 lines instead of 2. The new compact-layout tests pass.

## Implementation and invariant verdicts

1. **Analysis requirements: satisfied.** Both location-provider availability and
   analysis-off witness exclusion use `checkAnalysisNeeds`. The recipe-only check
   retains warning severity, `reportingUnit: file`, `onUnknown: skip` and a genuine
   analysis-on author witness. A source/dev/generated search found no direct
   needs-policy access outside the canonical helper. The unrelated dev unavailable
   probe also loads that helper from the candidate being tested.
2. **Frame height and disclosure: satisfied.** One layout calculation allocates
   main header, quiet statuses, coverage notices, body, spacers and footer. Excess
   quiet doctors get an omitted-count row with separate narrowed/clean counts.
   Short terminals compress chrome. The selected finding tree and navigation
   remain unchanged. Live repaint tests assert every line is cleared and the
   region below the frame is cleared, preventing stale rows.
3. **Maintained semantic profiles: satisfied.** The internal fixture type requires
   complete/narrowed for analysis-on profiles. Construction validates it at runtime
   too. All positives, lookalikes, aliases, supported transfers and same-line
   occurrence cases require complete; all three unsupported-neighbor cases require
   narrowed. Analysis-off profiles explicitly use unavailable behavior. A profile
   cannot pass with correct findings and an incorrect semantic status.

## Verification matrix

Counts are passed / failed / skipped. Final automated suite: **657 / 0 / 0**.

| Gate | Local | Fresh installed package |
| --- | --- | --- |
| Bundled verification | 265 / 0 / 15 | 265 / 0 / 15 |
| Required three-file focused suite | 118 / 0 / 0 | 118 / 0 / 0 |
| Async author/profile/corpus/location verification | 71 / 0 / 0 | 71 / 0 / 0 |
| Async generated profiles | 21 / 0 / 0 | 21 / 0 / 0 |
| Reference consumer verification | 26 / 0 / 1 | 26 / 0 / 1 |
| Reference generated profiles | 21 / 0 / 0 | 21 / 0 / 0 |
| Recipe-only reporting-unit verification | 9 / 0 / 0 | 9 / 0 / 0 |
| New mutation controls | 7 / 0 / 0 | 7 / 0 / 0 |
| Original independent behavioral cases | 55 / 0 / 0 | 55 / 0 / 0 |
| Fresh independent behavioral cases | 20 / 0 / 0 | 20 / 0 / 0 |
| Exact-location independent cases | 2 / 0 / 0 | 2 / 0 / 0 |

The three original mutation controls still reject their intended defects. The
five unavailable-analysis controls also pass locally and packed. Fifteen bundled
legacy skips remain unchanged. The reference consumer retains one inherited info
location skip: no authored two-position witness for `send-without-retry-option`.
There are no inherited automated failures hidden in the passing counts.

## Optional-provider consumer

The exact same tarball was separately installed using:

```sh
npm install --ignore-scripts --no-audit --no-fund --omit=optional <canonical-tarball-path>
```

The parser directory is physically absent. Recipe-only verification exits **0**:
**2 passed / 0 failed / 7 skipped**. Its analysis-on author fixture skips, five
analysis-on profiles skip, and its location gate skips for unavailable analysis.
The analysis-off profile executes and passes; the shared innocent corpus passes.
Runtime JSON retains the narrowed check and unavailable implied capabilities.
Built-in Async remains **12 / 0 / 59**, exit 0. JSON and human output were checked.

The full dashboard suite also passes in this absent-provider install: **54 / 0 / 0**.
Semantic mutations and finding-positive controls require the analysis provider;
they were run in the separate fresh normal install of these exact tarball bytes.
The omit-optional install was kept intact and was not repurposed for those tests.

## Dashboard frame measurements

Each row was checked at both 80 and 140 columns locally, in the normal consumer,
and in the omit-optional consumer; painted navigation checks complement these
pure-frame measurements.

| Quiet doctors | Terminal rows | Frame lines |
| --- | --- | --- |
| 0 | 34 | 33 |
| 1 (clean or narrowed) | 34 | 33 |
| 5 | 34 | 33 |
| 40 | 14 | 13 |
| 40 | 10 | 9 |
| 40 | 8 | 7 |

Large cohorts show bounded omitted counts. Mixed clean/narrowed cohorts with both
coverage notices also preserve the height at 3, 4, 5, 8, 10, 14 and 34 rows.

## Mutation outcomes

| Mutant | Required failure, local and packed |
| --- | --- |
| Unhandled lookalike becomes unknown | Expected complete, actual narrowed; no missing/unexpected findings. |
| Unhandled unsupported receiver becomes clear | Expected narrowed, actual complete; positive projection unchanged. |
| Unknown options become clear | Expected narrowed, actual complete; positive projection unchanged. |
| Unsupported resource transfer becomes clear | Reference consumer: expected narrowed, actual complete; projection unchanged. |
| Unsupported resource transfer becomes known-report | Async contextual-report consumer: expected narrowed, actual complete; projection unchanged. |
| Positive reporting suppressed | Positive profile has missing expected findings. |
| Semantic expectation omitted | Claim validation rejects with `semantic expectation is required for analysis-on challenges`. |

The first five mutations alter the semantic result after preserving the finding
projection, deliberately isolating semantic certification. All five fail through
semantic comparison with empty missing/unexpected arrays. Correct Async and the
second reference consumer pass every maintained profile.

## Frozen Sift

Local and installed-package scans cover **671 eligible files**, retain **9
findings**, and have identical exact finding and narrowing projections to the
reviewed candidate. Before and after each scan, **1,530 / 1,530** file hashes
match the canonical manifest. The frozen target was read-only throughout.

Coverage occurrences (separate from findings):

- Fetch unresolved identity: **2,027**.
- Fetch unsupported expression: **12**.
- Async-map unsupported expression: **21**.

Only the previously documented 39 removed fetch/unsupported-expression
transitions were individually adjudicated. Other historical reductions used
executable controls, deterministic counts and first-match/first-five-file
convenience samples. No precision estimate or new exhaustive claim is made.

## Code review

The code-review skill ran separate Standards and Spec agents against
`git diff a93313f3ddef2b69f50d8cf2072a323d979ebdf9...HEAD`.

### Standards

Zero findings initially and on the final cumulative source diff. Existing module
owners and documented certification/location contracts remain intact.

### Spec

One initial P2 found the 8/10-row edge. The correction was written after red tests,
then independently re-reviewed at `50efeab5303b622e5d00a2b48878001b0022e8d1`. The reviewer
reproduced exact heights and retained omitted summaries at 3, 4, 5, 8, 10, 11 and
14 rows. Zero remaining in-scope findings; no scope creep.

The supplied attachment was the spec source. No issue-tracker configuration
exists; the review did not require tracker access. Reviews do not substitute for
package or frozen-target gates.

## Reproduction and limitations

```sh
npm test
node bin/cli.js verify --all
node --test test/sdk-candidate-boundaries.test.mjs test/sdk-invariants.test.mjs test/dashboard.test.mjs
node dev/doctor-sdk/run-semantic-mutations.mjs <candidate-root> <fresh-output-directory>
npm pack --ignore-scripts --pack-destination <fresh-output-directory> --json
node dev/doctor-sdk/check-optional-provider.mjs <canonical-tarball-path> <fresh-consumer-directory>
DOCTOR_CANDIDATE_ROOT=<installed-package-root> node --test test/sdk-candidate-boundaries.test.mjs test/sdk-invariants.test.mjs test/dashboard.test.mjs
git diff a93313f3ddef2b69f50d8cf2072a323d979ebdf9...HEAD
git diff --check
git status --short
```

`results.json` contains exact counts and verdict rows; `evidence.tar.gz` retains
sanitized command records, raw failed and passing JSON/stdout/stderr, mutation
results, independent seeds/runners, working-file digests and frozen manifests.
The complete cumulative source diff was inspected, including generated output.
The final evidence-only commit is separately checked for packaging neutrality.

This pass does not change finding semantics, candidate detection, type support,
opaque-flow uncertainty or cross-file analysis. Small screens necessarily show
less detail and summarize cohorts; normal terminal width truncation remains.
Passing these maintained profiles does not establish arbitrary-program accuracy.
No publication or autonomous-fix safety claim is made.

## Every changed file

| File | Reason |
| --- | --- |
| `bin/certify.d.ts` | Regenerated runtime or declaration matching the corresponding TypeScript implementation. |
| `bin/certify.js` | Regenerated runtime or declaration matching the corresponding TypeScript implementation. |
| `bin/dashboard.d.ts` | Regenerated runtime or declaration matching the corresponding TypeScript implementation. |
| `bin/dashboard.js` | Regenerated runtime or declaration matching the corresponding TypeScript implementation. |
| `dev/async-analysis/check-unavailable.mjs` | Use the tested candidate canonical requirements instead of inspecting explicit metadata as policy. |
| `dev/doctor-sdk/check-optional-provider.mjs` | Assert the recipe-only warning author fixture and location gate skip with the absent provider. |
| `dev/doctor-sdk/run-semantic-mutations.mjs` | Retain seven isolated mutation controls, including unchanged-finding semantic mismatches and missing expectations. |
| `docs/doctor-sdk.md` | Document mandatory semantic classifications and recipe-implied location witness eligibility. |
| `fixtures/doctor-sdk-recipe-only.fixtures.mjs` | Supply an analysis-on native-map positive author fixture with an exact location. |
| `fixtures/doctor-sdk-recipe-only.mjs` | Declare file reporting unit on the warning recipe-only check without adding redundant needs. |
| `src/certify.ts` | Use canonical implied needs for both location policies; require and validate explicit semantic expectations for every analysis-on profile. |
| `src/dashboard.ts` | Budget quiet statuses, notices and finding rows together; summarize omitted doctors and compress chrome for short terminals. |
| `test/dashboard.test.mjs` | Assert fixed-height mixed frames, omitted summaries, navigation and stale-row clearing; run same suite against installed modules. |
| `test/sdk-invariants.test.mjs` | Pin both location policies, every recipe-family semantic classification and mutation rejection independently of findings. |
| `docs/evidence/doctor-sdk-foundations/50efeab-final-invariants/verification-report.md` | Final bounded verification report, red failures, review disposition and limitations. |
| `docs/evidence/doctor-sdk-foundations/50efeab-final-invariants/results.json` | Machine-readable counts, exact package provenance, mutations and frozen integrity. |
| `docs/evidence/doctor-sdk-foundations/50efeab-final-invariants/evidence.tar.gz` | Compressed sanitized failure and final logs, runners, seeds, manifests and commands. |
| `docs/evidence/doctor-sdk-foundations/50efeab-final-invariants/changed-files.json` | Every changed file with reason and implementation SHA-256. |
