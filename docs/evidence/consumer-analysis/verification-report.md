# Consumer-analysis candidate verification

## Evidence provenance after review reorganization

At the user's request, the original four local commits were undone while
preserving their files, and this evidence is now committed separately. The
implementation, tests and reproduction scripts remain in the working tree for
review and a later implementation commit. This evidence-only commit is not an
executable candidate. The results below record the original candidate
`e19e81dc2e6f62771e0be5596cf5967530e27d8f`; the historical commit references and
packed-artifact provenance are retained. They do not certify a future commit.

## Original verification record

This report records implementation evidence for independent review. It is not a
population precision measurement or independent sign-off. The final packed gate
is generated **after this report's commit**, from `git archive <candidate>`, to
avoid an artifact/commit self-reference. Its authoritative commit, SHA-256, clean
consumer installation, per-doctor counts and outcomes are retained at
`/tmp/any-doctor-consumer-final/verification.json` and summarized in the final
handoff. A missing/failed packed sidecar means that gate is not complete.

## Checkout and authority

- Checkout: `/Users/nickdejesus/Code/any-doctor`; branch: `website/docs`.
- Base: `6e4b1cb43a1bde69fdc13846a8940eb62c26a153`, initially clean.
- Executable implementation/review repair commits: `f1eb9c75bf4666b6b73357d9e13bf3858ba8ced3`,
  `f205261485409db1ae52c27319ba71d8f99db08b`, `de33df5a2b64389450b8d0e3f98e02fb17163590`.
- The final candidate also commits this report, sanitized evidence and reproduction
  tools. Its exact SHA is the packed sidecar's `sourceCommit`; use that SHA for
  independent retesting. No executable detector changes followed the reviewed
  repair commit. The baseline runner's command-argument repair is included.
- The user's current instruction superseded the handoff's new-branch instruction.
  No main movement, push, PR, npm publication, deployment or credential change.
- Sift remained read-only: no app, hosted data, decisions or source cleanup.

## Responsibilities and behavior

The host now owns shared file roles, captured reference inventory, module
resolution, scope-bound consumer relationships, coverage, source digests and
literal-preserving function structure. Slop owns candidate selection, a body
complexity threshold, affected-site reporting and review wording.

Tests and generated files can establish dependencies without becoming default
diagnostic targets. Named/default imports, aliases, supported namespaces,
barrels/cycles, relative extension/index resolution, tsconfig aliases and
captured package entries are represented by identity. Type, test, runtime,
static import, re-export, public and uncertain evidence are distinct. A re-export
is preserved even without a final caller. Unknown affected paths abstain; parser
and infrastructure errors fail loudly.

Both changed checks use revision 2. Duplicate comparison preserves strings,
regexes, template raw/cooked values and BigInts, uses exact function ranges and
reports every site. It claims matching source structure, not shared behavior or
safe consolidation. Export prompts do not authorize module/initializer deletion.

## Verification results

| Gate | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Full automated suite (including CLI consumer regressions) | 435 | 0 | 0 |
| Labeled candidate CLI cases | 48 | 0 | 0 |
| Same labels against published 0.1.2 | 16 | 32 | 0 |
| Slop certification | 48 | 0 | 0 |
| Async certification | 41 | 0 | 3 |
| Convex certification | 97 | 0 | 0 |
| Effect certification | 30 | 0 | 10 |
| OpenRouter certification | 12 | 0 | 5 |

Other doctors' 18 legacy location-coverage skips remain explicitly unexercised;
this work did not relabel them or treat them as passes. Slop's baseline had
31 passed result rows and eight undeclared reporting-unit skips; its candidate
has passing occurrence witnesses for every check. Build/type checks and
`git diff --check` passed. Expected parse failure is a passing regression case
because it fails loudly; uncertainty cases are abstentions, not clean verdicts.

- [Per-case table](case-results.md), [published baseline cases](cases-before.json),
  [candidate cases](cases-after.json)
- [Full suite output](full-tests.txt), [bundled verification output](bundled-verify.txt),
  [separate doctor counts](bundled-counts.json), [baseline Slop verify](slop-verify-before.txt)
- [Internal Standards and Spec review](internal-review.md)

The first 28 labels were written before detector repair; later regression cases
cover additional requirements and review discoveries. Two pre-existing duplicate
expectations changed intentionally: the two-statement slug helper is now trivial,
and missing analysis now abstains instead of using an inaccurate text fallback.
Their original seeds remain, along with substantial positive controls.

## Frozen Sift comparison

Snapshot: `/tmp/any-doctor-frozen-sift`, captured from
`/Users/nickdejesus/Code/sift-skills` at
`555ffb36e57a042165d3b9873b4641f31b3451f9`, with the existing dirty
`convex/_generated/api.d.ts`. Only tracked JS/TS/JSON working bytes were copied;
no secrets, env files, untracked artifacts, dependencies or git state.
[The manifest](sift-manifest.json) records every copied file, byte count and SHA-256,
with manifest digest `336f413f63936775224d5f9c8c1f5ba9abe9a465c9ef300fba93fac3657797f2`.
The snapshot contains 1,530 files; 1,514 authorized source/config files contribute
to the graph (1,067 code modules). Hidden paths remain excluded.

| Run | Diagnostic files | Export findings | Duplicate sites | Total |
| --- | ---: | ---: | ---: | ---: |
| Published 0.1.2 | 679 | 98 | 80 | 178 |
| Candidate | 671 | 32 | 35 | 67 |

The historical 690/179 live-tree run is not reused as a denominator: this sanitized
tracked-file snapshot deliberately omits untracked artifacts. Both comparison
runs use the identical snapshot and default flags. Generated declarations explain
the candidate diagnostic-scope reduction; tests still supply reference evidence.

Every site in the union of before/after outputs is classified in
[sift-classifications.json](sift-classifications.json):

| Classification | Exports | Duplicate sites |
| --- | ---: | ---: |
| Corrected false positive | 76 | 0 |
| Preserved positive/candidate | 22 | 24 |
| Intentional narrowing | 0 | 56 |
| New review candidate | 10 | 11 |
| Unexplained regression in the compared union | 0 | 0 |

“Preserved positive” means the bounded concern remains supported, not that code
must be removed. This comparison cannot count positive cases both versions miss.
All 21 new sites were read against source. The duplicate additions are five groups
whose parameter/body structure matches despite names, comments or formatting;
several are small guarded helpers that can reasonably remain separate.
Captured `escapeHtml`, whitespace helpers and client/server ownership need review.

The ten new exports have no supported current-source consumer in the snapshot.
Two benefits constants appear in a prototype build template, but that generator
explicitly loads historical Git commit `0df2999f01053451ccc3a230f7ef736e769e8b10`,
not current working bytes. Avatar has an additional comment-only hit.
[Reference search evidence](new-export-reference-search.txt) and per-site source
review notes preserve these distinctions. A lazy component and two loader entries
found during intermediate source review were repaired before final evidence.

[Before output](sift-before.json), [after output](sift-after.json) and
[performance/provenance](performance.json) retain exact scan flags, coverage,
analysis availability, versions, durations and failures. Both final scans have
zero crashed doctors and an available analysis engine.

## Resource observations and remaining boundaries

On this Apple Silicon macOS host, Node 26.5.0, the sequential observed CLI times
were about 3.55 seconds (published baseline) and 11.17 seconds (candidate). The
shared graph measured 5.19 seconds for 13,170,748 source bytes, with a peak host
RSS of 778,464 KiB (about 760 MiB). This is one representative repository and one
measurement, not a scalability claim; AST/scope retention has a material memory
cost. The graph records 20 coverage issues, scoped to affected evidence.

Versions: OXC 0.149.0, scope-manager 8.70.0, ast-grep CLI 0.45.3; candidate
TypeScript 5.9.3. Effect resolved to rc.112 locally and rc.115 in the clean published
baseline. Exact dependency provenance is in the performance file and
[baseline install lock](baseline-package-lock.json); the packed consumer records
its independently resolved dependency tree.

[Supported resolution and configuration](../../project-consumer-analysis.md)
spell out the boundaries: ESM JS/TS; nearest tsconfig with captured local extends;
Node10/16/Next/Bundler modes; exact captured package entry mappings. No target
configuration execution, node_modules graph, symlink workspace traversal, full
type checker, whole-program call graph or arbitrary generated-code evaluation.
Unsupported project references, external config inheritance, unavailable package
source mappings and namespace/value flows expose coverage limits. An unbounded
dynamic import can legitimately make a broad scope uncertain; known namespaces
and missing relative modules do not suppress unrelated exports.

Other framework/custom-loader entries need declarative `entryPoints`. Absence of
internal references does not rule out external consumers. CommonJS/import-equals
flow, namespace/type-only reexport member propagation and stored import promises
are conservative uncertainty rather than guessed runtime consumers. Tiny guarded
helpers can still meet the duplicate threshold; the report does not assert a
maintenance defect. Missing engines, unsupported cases and clean exercised cases
remain distinct. No claim of universal correctness or independent acceptance.

## Reproduction

From the candidate checkout (Node/dependencies installed with its lockfile):

```sh
npm ci
npm run build
npm test
node bin/cli.js verify --all
node dev/consumer-analysis/run-cases.mjs bin/cli.js /tmp/candidate-cases.json
node dev/consumer-analysis/measure-sift.mjs
node dev/consumer-analysis/compare-sift.mjs /tmp/any-doctor-frozen-sift docs/evidence/consumer-analysis/sift-after.json
node dev/consumer-analysis/pack-candidate.mjs "$(git rev-parse HEAD)" /tmp/any-doctor-consumer-independent
```

The comparison tool supplies initial classifications; preserve the committed
source-review annotations when regenerating its machine aid. To create a new
snapshot, use `dev/consumer-analysis/freeze.mjs <new-directory>` only after checking
Sift's commit and dirty bytes against the manifest. It refuses to overwrite an
existing snapshot. For the published baseline install use exactly
`npm install --ignore-scripts any-doctor@0.1.2` in a separate clean directory;
`run-cases.mjs` selects that installation's explicit bundled doctor path from its
CLI argument, avoiding local/global doctor shadowing.

The packed gate installs the exact tarball in a clean consumer, verifies every
bundled doctor, executes all 48 CLI cases, runs the same frozen Sift snapshot,
compares every packed finding with local output, and verifies all installed
`bin/` and `doctors/` file digests against the archived source commit. It retains
all logs, the dependency tree, tarball path/digest and final outcome in its output
directory. Publication and deployment are not part of that script.
