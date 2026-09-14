# Dashboard physical-width verification

The dashboard now normalizes every emitted line through the existing ANSI-aware
truncation primitive. All recorded final frames satisfy **logical lines = physical
rows = terminal rows − 1**, with every line's visible width within the terminal.

This report **supersedes the dashboard fixed-height claim** in
`../50efeab-final-invariants/verification-report.md`. That claim measured newline
count only and did not establish that lines could not wrap. Its other evidence
remains historical; this pass creates no new frozen-scan evidence.

## Candidate and artifact

- Branch: `feature/doctor-sdk-foundations`; starting tree clean.
- Reviewed start: `32cd39fe73ca4e517067f43419c315e34b4982f4`.
- Implementation candidate: `f4efb938dff8fb26686fe6696a070d40cc83014f`; source tree clean after commit.
- Exactly five implementation/generated/test files changed. Evidence is a separate
  commit, excluded from the package. `changed-files.json` lists all nine files.
- Fresh package: `/private/tmp/any-doctor-dashboard-width/final/package/any-doctor-0.1.2.tgz`, **276,026 bytes**, **144 files**, version **0.1.2**.
- SHA-256: `13fece891a95e6938a07ac117177089bdd6df7b126d7cf9cf881e5dc5b8bd2f1`.
- Every shipped entry was compared byte-for-byte with the working implementation.
- Final evidence-commit HEAD, branch, clean status and byte-identical repack receipt
  are retained at `/private/tmp/any-doctor-dashboard-width/final/final-head-verification.json`.
  The evidence commit is resolvable with `git log -1 --format=%H -- docs/evidence/doctor-sdk-foundations/dashboard-physical-width`.
  This external receipt avoids a self-referential commit hash inside its own commit.
- No reset, branch switch, push, publication or pull request occurred.

## Red evidence

New assertions were added before implementation. The first run had **75 pass / 41
fail / 0 skip**: 39 width regressions plus two malformed test-provider metadata
errors. After correcting only the test setup, the original renderer produced
**77 / 39 / 0**. The original product was loaded through the existing candidate-root
seam from a temporary copy; the checkout was never reset.

Both ANSI color modes produced the same baseline width and physical-row failures.
For the 40-doctor mixed cohort with both notices:

| Terminal | Logical lines | Red maximum width | Red physical rows | Final maximum width | Final physical rows |
| --- | --- | --- | --- | --- | --- |
| 80×3 | 2 | 120 | 3 | 80 | 2 |
| 80×4 | 3 | 120 | 5 | 80 | 3 |
| 80×5 | 4 | 120 | 6 | 80 | 4 |
| 80×8 | 7 | 95 | 8 | 80 | 7 |
| 80×10 | 9 | 95 | 10 | 80 | 9 |
| 80×14 | 13 | 95 | 14 | 80 | 13 |
| 80×34 | 33 | 95 | 34 | 80 | 33 |

The compact baseline is 120 columns here versus 121 in the independent report
because this fixture renders a 2ms duration rather than 10ms. It reproduces the
same wrapping defect. Complete red measurements, including 140 columns and both
color modes, are retained.

A further test exposed a mismatch between `truncateVisible` and `visibleWidth`
for non-BMP characters: **0 / 2 / 0** before repair, **2 / 0 / 0** afterward. At
20 columns the defective truncation emitted width 30 and consumed 8 physical rows
instead of 7. This was fixed in the shared primitive, without changing the width
model. The earlier package and pre-Unicode test totals are superseded by the
final artifact and counts below.

## Implementation

`dashboardFrame()` assembles compact or normal layout into one line array and
then normalizes every line. Headers, appended notices, quiet summaries, body and
footer all cross this boundary. Lower-priority overflow is truncated; terminal
sizes and height allocation are unchanged. A leading narrowed/clean glyph retains
status when a narrow terminal clips summary prose. Omitted and narrowed/clean
counts remain asserted at widths where they fit.

The shared truncator now increments by the same visible width its caller measures,
rather than counting each iterated Unicode code point as one. Existing SGR handling
is reused; no raw colored-string slicing was introduced. Selected finding trees,
navigation, cursor lifecycle and per-row/below-frame clearing retain their owners.

## Final verification

Counts are passed / failed / skipped.

| Gate | Working files | Fresh installed package |
| --- | --- | --- |
| Full automated suite, including rebuild | 721 / 0 / 0 | — |
| Bundled `verify --all` | 265 / 0 / 15 | 265 / 0 / 15 |
| Three required focused files | 182 / 0 / 0 | 182 / 0 / 0 |
| Seven semantic mutation controls | 7 / 0 / 0 | 7 / 0 / 0 |
| Independent reviewer dashboard rerun | 118 / 0 / 0 | 118 / 0 / 0 |
| Separate dashboard-only package gate | — | 118 / 0 / 0 |

The 15 bundled skips are inherited, not failed assertions. There are no inherited
automated failures hidden in the totals. All seven mutants are rejected for their
intended defect; per-mutant JSON and stdout are retained. No analysis, recipe,
certification, requirements, finding, scoring, provider or version files changed.

A separate fresh install of the exact tarball used `--omit=optional`; the parser
was physically absent. Recipe-only verification is **2 / 0 / 7**, exit 0. The
author witness, five analysis-on profiles and location gate skip for unavailable
analysis, while the off profile and innocent corpus pass. Built-in Async is
**12 / 0 / 59**, exit 0. JSON, human and runtime assertions remain green. Dashboard
checks in that install are **118 / 0 / 0**. Provider-dependent mutation checks use
the separate normal install, leaving the absent-provider consumer intact.

## Frame matrix and repaint evidence

`results.json` retains all **44** required matrix rows with color mode, terminal
size, logical lines, maximum visible width and physical rows. The archive retains
all **142** frame measurements for each final candidate. Working, packed and
omit-optional measurement arrays are identical; color-paired matrix results match.

Coverage includes 0, 1 clean, 1 narrowed and 5 quiet doctors at 34 rows, plus 40
mixed doctors at 3, 4, 5, 8, 10, 14 and 34 rows, all at 80 and 140 columns in both
color modes. Long doctor IDs, filenames, source, notices and footer overflow are
checked at 20, 40, 80 and 140 columns and 5/34 rows. Non-BMP notices are checked at
20/80 columns. Compact navigation checks assert changed selection frames, clear to
end-of-line on every row and clear below the frame.

The physical-row helper uses exactly
`sum(max(1, ceil(visibleWidth(line) / cols)))`. It removes cursor-paint controls but
leaves SGR color codes for the repository width utility. Every frame recorded by
this helper also checks each line's width, not just newline or total row counts.

## Code review

The code-review skill ran separate Standards and Spec passes against
`git diff 32cd39fe73ca4e517067f43419c315e34b4982f4...f4efb938dff8fb26686fe6696a070d40cc83014f`.

**Standards: zero findings.** Dashboard and TTY ownership, generated runtime,
repaint and navigation contracts remain intact; no actionable baseline smells.

**Spec: zero findings.** Review challenged ANSI width, physical rows, smallest
required dimensions, long IDs and notices, footer truncation and package parity.
The reviewer independently reran dashboard checks locally and packed (118 each).
A possible long-ID disclosure issue was challenged at 80×3 and 80×4 and ruled out:
the reserved cohort row retains “40 more quiet doctors — 20 narrowed, 20 clean.”
Review details and independent stdout are retained in the archive.

## Reproduction and retained evidence

From the repository root:

```sh
npm test
node bin/cli.js verify --all
node --test test/dashboard.test.mjs test/sdk-invariants.test.mjs test/sdk-candidate-boundaries.test.mjs
node dev/doctor-sdk/run-semantic-mutations.mjs "$PWD" <fresh-mutation-output>
npm pack --ignore-scripts --pack-destination <fresh-package-output> --json
# In a fresh consumer with package.json:
npm install --ignore-scripts --no-audit --no-fund <exact-tarball-path>
# Back in the repository:
DOCTOR_CANDIDATE_ROOT=<consumer>/node_modules/any-doctor DASHBOARD_WIDTH_EVIDENCE=<measurements.json> node --test test/dashboard.test.mjs
DOCTOR_CANDIDATE_ROOT=<consumer>/node_modules/any-doctor node --test test/dashboard.test.mjs test/sdk-invariants.test.mjs test/sdk-candidate-boundaries.test.mjs
node dev/doctor-sdk/run-semantic-mutations.mjs <consumer>/node_modules/any-doctor <fresh-packed-mutation-output>
node dev/doctor-sdk/check-optional-provider.mjs <exact-tarball-path> <fresh-optional-consumer>
DOCTOR_CANDIDATE_ROOT=<fresh-optional-consumer>/node_modules/any-doctor node --test test/dashboard.test.mjs
git diff 32cd39fe73ca4e517067f43419c315e34b4982f4...HEAD
git diff --check
```

`evidence.tar.gz` retains red/final stdout and stderr, per-command arguments/cwd/
exit records, runners, full working-file SHA-256 manifests, mutation JSON,
optional-provider outputs, package manifest, all frame measurements and review.
The runner supplies `DOCTOR_CANDIDATE_ROOT` and `DASHBOARD_WIDTH_EVIDENCE` explicitly;
those environment settings are visible in retained `final/verify.py`. Local paths
are replaced with `<REPO>` and `<EVIDENCE>` in archived logs. No node_modules trees
or tarball are committed; the exact package path and hash above identify it.

## Evidence boundary

The complete five-file source diff and generated output were inspected. Frozen
Sift evidence remains unchanged and **no frozen scan was rerun**. All protected
systems are unchanged by the diff and working-file manifest.

This establishes the requested repository width model, which strips SGR and
counts UTF-16 units. It does not introduce full Unicode terminal-cell measurement
for arbitrary fonts, combining sequences or wide characters. Small screens clip
lower-priority detail. No publication or broader analysis-accuracy claim is made.
