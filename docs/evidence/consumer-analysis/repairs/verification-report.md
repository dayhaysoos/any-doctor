# Consumer-analysis repairs for another independent retest

The three reported host defects are repaired in the current working files.
This is implementation verification, **not independent acceptance**. The
reviewer's unchanged 30-case suite now passes 29 cases; its inherited `.mts`
diagnostic-scope failure remains visible and is outside these three repairs.

## Candidate and preservation

- Working tree: `/Users/nickdejesus/Code/any-doctor`, branch `website/docs`.
- HEAD remains `d81987b62429765b4f64fa4b8dbcbb96f10966d2`, an evidence-only commit.
  The candidate is the uncommitted working files, not HEAD.
- No reset, checkout, commit, push, publication, deployment or Sift write occurred.
  Existing modifications and untracked implementation are preserved; nothing is staged.
- [Working-file manifest](working-files.json) hashes 172 source, generated runtime,
  doctor, test, verification-script and package/config files. Its digest is
  `b6845c8d223ad4d5331318fcef0c0a449673497646d4689515f1b8e3d0e5e421`
  (SHA-256 of the compact JSON serialization of its ordered `files` array).
- [Package verification](verification.json) binds the artifact to all 86 installed
  runtime/doctor/package files and records commands, statuses, counts and Node version.
  Current working files were checked against the manifest again after the gates.
- [Status](status-after.txt) and [integrity](integrity.json) record preservation.
  An unrelated quickstart document changed concurrently; no repair command edited
  `docs-site`. The pre-existing welcome document changes were also left intact.

## Repairs and ownership

All runtime repairs are in the host's `src/project-consumers.ts`, rebuilt into
`bin/project-consumers.js`. Slop selection, duplicate comparison, candidate
wording, reporting units and scope separation are unchanged.

1. **Template imports:** a fixed prefix alone no longer bounds targets. Narrow
   directory uncertainty requires each substitution to be a literal or a
   scope-resolved immutable const string with the conservative `[A-Za-z0-9_-]+`
   alphabet, and fixed template portions that cannot introduce traversal or URL
   encoding. Unknown/mutable/shadowed values, separators, parent segments and
   percent encodings cause project-wide uncertainty. Literal/interpolation-free
   targets retain exact resolution. Interpolated templates remain uncertainty,
   not asserted runtime use, including constants outside this bounded subset.
2. **Unsupported config:** bare imports and re-exports under an unsupported
   tsconfig propagate target uncertainty across the captured project, including
   outside the importing directory. Propagation occurs after all export origins
   are collected. Relative imports and `node:` builtins do not add unbounded alias
   uncertainty; supported configs and unrelated outer scopes remain useful.
3. **Require identity:** callee references are matched to scope bindings. A local
   non-loader named `require` no longer suppresses findings. Actual unshadowed
   require and direct variables initialized through named/aliased/namespace
   `createRequire` imports retain loader uncertainty. `import.meta.url` supplies
   a known base; other bases, reassignment and unknown arguments widen uncertainty.
   Arbitrary loader aliases and interprocedural inference remain unsupported.

[Repair-only source diff](repair-source.diff) excludes the larger pre-existing
implementation. [Resolution boundaries](../../../project-consumer-analysis.md)
describe the supported subset and tradeoffs.

## Verification results

Counts are passed / failed / skipped. Full automated tests are not shipped in the
package; the packed gates use the installed CLI and explicit installed doctors.

| Gate | Local working files | New packed artifact |
| --- | --- | --- |
| Full automated suite, including rebuild/typecheck | 467 / 0 / 0 | Not shipped |
| Labeled CLI cases | 80 / 0 / 0 | 80 / 0 / 0 |
| Unchanged independent challenges, rerun by implementer | 29 / 1 / 0 | 29 / 1 / 0 |
| All bundled certification | 228 / 0 / 18 | 228 / 0 / 18 |
| Slop subset | 48 / 0 / 0 | 48 / 0 / 0 |
| Async subset | 41 / 0 / 3 | 41 / 0 / 3 |
| Convex subset | 97 / 0 / 0 | 97 / 0 / 0 |
| Effect subset | 30 / 0 / 10 | 30 / 0 / 10 |
| OpenRouter subset | 12 / 0 / 5 | 12 / 0 / 5 |
| Frozen Sift findings | 67, no crashes | 67, no crashes |

Build/typecheck, installation, `npm ls --all --json`, and `git diff --check`
succeeded. JSON failure counts were checked explicitly. Eighteen legacy bundled
skips remain unexercised. The original independent suite's seeds and expectations
are unchanged; only CLI and output paths were parameterized in the retained runner.

Before edits, the unchanged challenge suite reproduced **25 passed / 5 failed**.
The first six repository regression cases reproduced **1 passed / 5 failed**,
including the real external-config witness. All six now pass. A re-export
ordering regression was also observed failing before its compiled repair.
The 80 labeled cases retain the original 48 and add 32 reproductions/controls.

- [Per-case independent before/local/packed results](independent-before-after.json)
- [All 80 labeled local results and coverage](labeled-local-summary.json)
- [Full suite log](npm-test.log), [bundled log](local-verify-all.log)
- [Initial failures](before-regressions.log), [re-export ordering failure](before-reexport.log)
- [Raw evidence archive](raw-evidence.tar.gz): separate before/local/packed scans,
  complete labeled JSON, exact challenge seeds, logs, dependencies, manifest checks
  and the failed initial harness attempt. Extract into a fresh directory.

The initial packed harness used `effect-v4.mjs` instead of the actual
`effect-v4-kitlangton.mjs` and stopped with a missing-doctor error. After correcting
that harness filename, the entire package gate ran in a fresh `packed-final`
directory. No detector repair was needed. Both attempts are retained.

## Frozen comparison and remaining limits

All 1,530 frozen source files match the original manifest. The new local and
packed runs match the retained 67 findings exactly by rule, file, line, column
and message: 32 export findings and 35 duplicate sites. The same 20 coverage
issues remain. There are **no changed findings requiring new source adjudication**
in this repair comparison. [Comparison](frozen-comparison.json) and
[preservation checks](preservation-check.json) record the result; raw scans are
in the evidence archive. Live Sift was not scanned or modified.

The inherited diagnostic boundary remains `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`.
The graph inspects `.mts`, `.cts`, `.cjs` references, but Slop does not diagnose
exports in those extensions. `mts-authored-positive` therefore remains a failed
assertion, not a skipped or silently relabeled passing case.

In the earlier baseline-to-candidate Sift comparison, **19 export findings were
suppressed solely by type evidence**, including `buildEvidencePrompt` and
`buildFitPrompt`. Those removals do not establish production callers. Preserving
type dependencies is a conservative precision/recall tradeoff that can hide
runtime-dead candidates. Likewise unbounded config/template uncertainty can
suppress genuinely unused exports; narrowness must be supported by evidence.

No repair acceptance requirement is left unperformed. The inherited extension
failure remains explicitly out of scope; external independent sign-off is pending.

## Artifact and rerun

New artifact (canonical path):
`/private/tmp/any-doctor-consumer-repairs/packed-final/any-doctor-0.1.2.tgz`

SHA-256: `8c032e0509e15be165e55827930f9bcec1183635db3340bbee7433ba46a3e044`

Version remains 0.1.2; this is a local artifact, not a new publication. The original
`/tmp/any-doctor-consumer-final/any-doctor-0.1.2.tgz` remains unchanged. The new
artifact was packed from current working files, never from `git archive HEAD`.
Installation used canonical paths and a fresh consumer; npm metadata checks pass.

From `/Users/nickdejesus/Code/any-doctor` (use fresh output paths):

```sh
npm test
node bin/cli.js verify --all
node dev/consumer-analysis/run-cases.mjs bin/cli.js /tmp/retest-labeled.json
python3 dev/consumer-analysis/independent-challenges.py local /tmp/retest-challenges
node bin/cli.js run /Users/nickdejesus/Code/any-doctor/doctors/slop.mjs /tmp/any-doctor-frozen-sift --format json > /tmp/retest-sift.json
node dev/consumer-analysis/pack-working-candidate.mjs /tmp/retest-new-package
```

The package runner refuses an existing output directory, validates file digests,
checks labeled JSON counts, retains the independent extension failure unchanged,
and runs every installed bundled doctor and the frozen scan. It does not publish.
For direct retesting of the retained artifact, install it in another fresh consumer
and pass its explicit installed `bin/cli.js` as the third runner argument to
`independent-challenges.py` (after the label and new output directory).
