# Unicode terminal-cell-width verification

**Verdict: the conventional terminal-cell-width guarantee is satisfied under the
policy below.** Every recorded frame fits its declared columns and uses exactly
`rows - 1` logical and calculated physical rows. Local, packed and omit-optional
measurements are identical.

This new evidence directory **supersedes only the UTF-16 width limitation** in
`../dashboard-physical-width/verification-report.md`. Earlier evidence is unchanged.
This is a terminal-rendering correction, not an analysis-quality claim.

## Provenance

- Branch: `feature/doctor-sdk-foundations`.
- Reviewed start: `d469c162f09e33c1fc69b9319f2569a8f8ad3871`; starting working tree clean.
- Final implementation candidate: `60f0419d096b3aec6013b8248efa480d0bdf7617`; source working tree clean.
- Implementation commits: `1ad2e6a`, `1bfdea5`, `60f0419`.
- Evidence is committed separately; seven implementation/dependency/test files and
  four evidence files comprise the complete change. See `changed-files.json`.
- Final evidence-commit HEAD, branch, working-tree status and repack comparison are
  recorded after committing at `/private/tmp/any-doctor-unicode-width/acceptance/final-head-verification.json`.
  Resolve its evidence commit with `git log -1 --format=%H -- docs/evidence/doctor-sdk-foundations/unicode-terminal-width`.
  The external receipt avoids embedding a self-referential hash in its own commit.
- No reset, branch switch, push, publication or pull request occurred.

## Supported terminal-cell policy

Printable ASCII is one cell. East Asian Wide and Fullwidth bases are two cells;
Ambiguous characters use width one. Combining marks, variation selectors and
joiners add no cells. Grapheme segmentation uses Node's ICU `Intl.Segmenter`.
The first non-mark/non-ignorable base supplies the East Asian width, except that
common emoji-presentation clusters, VS16 pictographs, valid keycaps and complete
joined pictographs occupy two cells for the entire cluster. Text-default warning,
info and check symbols stay one cell unless emoji presentation is requested.
A trailing ZWJ alone does not turn a text symbol into an emoji.

ANSI SGR sequences occupy zero cells. One grammar accepts semicolon and colon SGR,
including RGB and indexed colors. Fitting safe strings retain their bytes.
Truncated strings deliberately lose styling, so they cannot emit partial escapes
or leave active styles behind. Plain text is segmented before truncation, including
when SGR transitions occur inside a combining or emoji sequence. The ellipsis
occupies one cell inside the budget. Width zero returns no bytes; width one returns
fitting content or a one-cell ellipsis. Other VT commands, C0/C1 controls, line
separators and bidi layout controls are removed from content lines. Painting owns
cursor commands; doctor-controlled content does not.

No Unicode range list was hand-maintained in production. The exact
`get-east-asian-width@1.6.0` dependency supplies generated Unicode East Asian Width
ranges. Its [upstream generator](https://github.com/sindresorhus/get-east-asian-width/blob/v1.6.0/scripts/build.js)
reads the Unicode Character Database. Runtime segmentation/properties follow the
installed Node ICU version; runtime manifests are archived. Both Node26.5.0 and
Node18.20.8 pass the reviewed Unicode corpus.

## Dependency choice and package impact

The Node18-compatible `string-width` release was evaluated but classifies bare
text-default symbols such as warning/info as two cells. That altered existing
layout and did not match the chosen text-presentation policy. The smaller table
package provides the required maintained width data without a formatting framework.

`get-east-asian-width1.6.0` is a **direct exact production dependency**, ESM, MIT,
Node≥18, with **zero runtime dependencies**. The lockfile pins its integrity;
existing dependency entries are unchanged. All eight dependency files match across
the working install, normal consumer and omit-optional consumer. Its tarball is
**5,310 bytes**; installed files total **14,592 bytes**. No version bump occurred.

Fresh Any Doctor package:

- Path: `/private/tmp/any-doctor-unicode-width/acceptance/package/any-doctor-0.1.2.tgz`.
- SHA-256: `3e7fe2597e23505a6041284baaae659a1d3a91c9e754ed5ee0ad2399305369f5`.
- **277,030 bytes**, **144 files**, version **0.1.2**.
- Increase over the reviewed package: **1,004 bytes**; file count unchanged.
- Dependency files are installed separately, not bundled into this tarball.
- Every shipped entry matched its working file. Final-HEAD repacking must remain
  byte-identical and is recorded in the final receipt.

## Test-first failures

Before production edits, new independent expectations failed for CJK, fullwidth,
combining marks, ZWJ/skin-tone/flag clusters, ANSI, truncation and controls. Initial
runs also exposed test setup omissions: the closed oracle needed existing `›` and
`ℹ` UI glyphs, and navigation needed a second selectable finding. Those were fixed
without weakening Unicode expectations.

The authoritative corrected starting-candidate rerun is **135 passed / 34 failed /
0 skipped**, using product bytes from `d469c162f09e33c1fc69b9319f2569a8f8ad3871` in a temporary candidate-root copy
and the test snapshot at `1ad2e6a`. No checkout/reset was used. Raw earlier runs,
corrected baseline and the test snapshot are retained in the archive. Baseline
failures include `visibleWidth("界")` returning1 instead of2, combining sequences
returning2 instead of1, split emoji clusters, zero-width overflow and controls
escaping content. The oracle rejects unreviewed or split glyphs instead of assigning
them a convenient width.

The independent 20×8 CJK reproduction contains a CJK doctor ID, filename and
narrowed quiet doctor. It reproduces the physical-row defect in both color modes:

| Candidate | Logical rows | Maximum cells | Physical rows |
| --- | --- | --- | --- |
| Reviewed start, color off/on | 7 | 35 | 11 |
| Final working/packed/optional, color off/on | 7 | 20 | 7 |

The supplied independent example had maximum32; this fixture's pathname yields35.
Both consume11 physical rows before repair. No expectation was relaxed to fit.

Review then caught keycap and trailing-joiner classification edges and an unused
incorrect lightning token in the oracle. Expanded controls were **42 / 8 / 0**
red, then **50 / 0 / 0** green. A subsequent colon-SGR probe measured a colored CJK
character as14 cells; its tests were **49 / 4 / 0** red, then **53 / 0 / 0** green.
All earlier packages and intermediate green totals are superseded by this report's
acceptance artifact. Red outputs preserve the precise failing assertions.

## Final tests and regressions

Counts are passed / failed / skipped.

| Gate | Working files | Fresh normal package |
| --- | --- | --- |
| Full `npm test`, including rebuild | 785 / 0 / 0 | — |
| Required three focused files | 192 / 0 / 0 | 192 / 0 / 0 |
| Independent Unicode corpus/boundaries | 53 / 0 / 0 | 53 / 0 / 0 |
| Bundled verify --all | 265 / 0 / 15 | 265 / 0 / 15 |
| Seven semantic mutation controls | 7 / 0 / 0 | 7 / 0 / 0 |
| Unicode corpus on Node18.20.8 | 53 / 0 / 0 | 53 / 0 / 0 |

The focused suite includes **128 dashboard tests**. Full test discovery also loads
the independent helper module; acceptance relies on the explicit assertions and
measurements, not that extra discovered module. Fifteen bundled skips are inherited;
there are no hidden inherited failures in the automated totals. All seven semantic
mutations are rejected for their intended defect; each result/log is retained.

The exact tarball was independently installed with `--omit=optional`. The parser
is physically absent; the new width dependency is present. Dashboard plus Unicode
checks pass **181 / 0 / 0**. Recipe-only verification passes **2 / 0 / 7**, exit0:
the author, five analysis-on profiles and location gate skip for unavailable
analysis; off-profile and innocent controls pass. Async verification is **12 / 0 /
59**, exit0. Human, JSON and runtime assertions remain green. Optional-provider
semantics were not modified. Mutations use the separate normal consumer.

## Independent measurements

The dashboard oracle imports no production width function, Unicode table or
segmenter. It uses reviewed literal cluster widths and ASCII/UI cells, failing on
unknown tokens. Utility expectations are hardcoded: `界=2`, `界界界=6`, `é=1`,
`🧪=2`, `👩‍💻=2`, `❤️=2`, skin-tone/flag/keycap clusters=2, standalone marks=0.
Boundaries assert exact complete output as well as independent width; ANSI bytes
are checked separately. The production and test implementations cannot agree merely
because they call the same incorrect function.

All **164** final frame measurements match across working, packed and optional
installs. Each has per-line cell bounds and the independent calculation
`sum(max(1, ceil(terminalCells(line) / cols)))`, plus exact logical rows. The new
Unicode matrix is below; all older dashboard dimension controls also remain active
and their complete records are in the archive.

| Terminal | Color | Logical rows | Maximum cells | Physical rows |
| --- | --- | --- | --- | --- |
| 20×8 | off | 7 | 20 | 7 |
| 20×8 | on | 7 | 20 | 7 |
| 40×8 | off | 7 | 40 | 7 |
| 40×8 | on | 7 | 40 | 7 |
| 80×3 | off | 2 | 80 | 2 |
| 80×3 | on | 2 | 80 | 2 |
| 80×8 | off | 7 | 80 | 7 |
| 80×8 | on | 7 | 80 | 7 |
| 80×34 | off | 33 | 80 | 33 |
| 80×34 | on | 33 | 80 | 33 |
| 140×34 | off | 33 | 140 | 33 |
| 140×34 | on | 33 | 140 | 33 |

CJK IDs and filenames, combining characters, emoji/ZWJ clusters, mixed long
notices, wide quiet IDs and bounded omitted summaries are represented. Quiet and
narrowed disclosures survive; omitted counts remain explicit where they fit.
Color-on/off matrices compare every line's cell width. Live Unicode navigation at
20×8 and existing compact navigation checks assert changed frames, clearing every
row and clearing below the frame. The final dashboard normalization boundary is
unchanged.

## Standards review

Final review of `git diff d469c162f09e33c1fc69b9319f2569a8f8ad3871...60f0419d096b3aec6013b8248efa480d0bdf7617`:
**zero remaining findings**. The initial keycap and oracle observations were fixed.
TTY ownership, existing dashboard boundary, generated runtime and dependency
compatibility remain intact. Shared SGR grammar removes inconsistent measurement
without introducing a second policy. Independent Unicode rerun:53/0/0; whitespace
validation passed. No documented-standard violations or actionable baseline smells.

## Spec review

Final review of the same fixed diff: **zero remaining findings**. Initial keycap,
trailing-ZWJ and oracle observations were fixed. The reviewer independently checked
complete emoji families and six SGR forms, including semicolon/colon RGB, indexed
colors and transitions inside graphemes. Fitting bytes, complete clusters and
style-free truncated output passed. Unicode rerun:53/0/0. No unrelated production
changes. Current package parity comes from the acceptance gates, not older reviews.

## Reproduction and evidence

```sh
npm test
node bin/cli.js verify --all
node --test test/dashboard.test.mjs test/sdk-invariants.test.mjs test/sdk-candidate-boundaries.test.mjs
node --test test/tty-unicode.test.mjs
node dev/doctor-sdk/run-semantic-mutations.mjs /Users/nickdejesus/Code/any-doctor <fresh-output>
npm pack --ignore-scripts --pack-destination <fresh-package-directory> --json
# In a fresh consumer with package.json:
npm install --ignore-scripts --no-audit --no-fund <exact-tarball-path>
# Back in the repository:
DOCTOR_CANDIDATE_ROOT=<consumer>/node_modules/any-doctor DASHBOARD_WIDTH_EVIDENCE=<measurements.json> node --test test/dashboard.test.mjs test/tty-unicode.test.mjs
node <consumer>/node_modules/any-doctor/bin/cli.js verify --all
node dev/doctor-sdk/run-semantic-mutations.mjs <consumer>/node_modules/any-doctor <fresh-mutation-output>
node dev/doctor-sdk/check-optional-provider.mjs <exact-tarball-path> <fresh-optional-consumer>
DOCTOR_CANDIDATE_ROOT=<fresh-optional-consumer>/node_modules/any-doctor node --test test/dashboard.test.mjs test/tty-unicode.test.mjs
DOCTOR_CANDIDATE_ROOT=<consumer>/node_modules/any-doctor npm exec --yes --package=node@18.20.8 -- node --test test/tty-unicode.test.mjs
git diff d469c162f09e33c1fc69b9319f2569a8f8ad3871...HEAD
git diff --check
```

`results.json` retains counts, package provenance, review and matrix values.
`evidence.tar.gz` contains raw red/final stdout/stderr, commands with exit codes and
candidate-root environments, exact working-file SHA-256 manifests, dependency
manifests, mutation JSON, optional-provider outputs, runtime versions and the
review record. Large logs remain compressed; no consumer node_modules or candidate
tarball is committed. Archived local paths use `<REPO>` and `<EVIDENCE>` placeholders.
The supplied attachment is the spec; no issue tracker was needed for this review.

## Remaining boundaries

This is a documented conventional terminal-cell model, not a promise about every
font, terminal emulator or shaping system. Grapheme/emoji properties depend on
Node ICU; new Unicode characters may need newer data/runtime versions. Ambiguous
width uses one regardless of locale. Complex shaping is represented by grapheme
base width and the stated emoji policy. Control removal and loss of styling on
truncation are intentional. The independent test oracle is a closed reviewed
corpus, not a general-purpose Unicode implementation.

No candidate detection, doctor recipe, certification, analysis requirement,
finding, semantic status, scoring or optional-provider implementation changed.
Frozen Sift evidence is unchanged, **no frozen scan was rerun**, and no new frozen
scan claim is made. The package remains unpublished.
