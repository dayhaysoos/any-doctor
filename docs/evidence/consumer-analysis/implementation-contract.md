Work in /Users/nickdejesus/Code/any-doctor. Implement the consumer-detection and Slop reliability improvements below, including tests and packed-package validation. This is an implementation request, not a request to stop after producing a plan.

## Product goal

Any Doctor should earn users' attention: when it reports something, the factual observation should be dependable and the explanation should establish a worthwhile concern. Users may reasonably keep intentional code. They should not need to correct the scanner's understanding of basic references before making that decision.

Preserve contextual review candidates. Distinguish a verified observation, the reason it may matter, and the judgment needed before changing code. A candidate label is not permission to make inaccurate claims. Aim for high precision with visible coverage limits; do not claim universal correctness or treat fewer findings as proof of quality.

## Authority and working state

- Read applicable AGENTS.md instructions and the project's current architecture/reliability guidance. Read CONTEXT.md, docs/vision.md, docs/doctor-reliability.md, and the resolved import/export graph section of docs/plans/analysis-improvements.md.
- The last inspected checkout was clean on website/docs at 6e4b1cb43a1bde69fdc13846a8940eb62c26a153, with package version 0.1.2. Revalidate this; it is historical context, not a checkout instruction.
- Preserve existing work. Implement on a dedicated non-main local branch, choosing and documenting its base after inspecting current branches and repository guidance. Do not overwrite unrelated changes or move main.
- You may implement in-scope code, regression tests, sanitized evidence and documentation, run local checks, and make intentional local commits. Do not publish to npm, push, open a PR, deploy, or change credentials without a separate request.
- Sift is a read-only evaluation target at /Users/nickdejesus/Code/sift-skills. Freeze a snapshot for comparison; do not clean up Sift source, run its application, access hosted data, or change its doctor decisions.
- Proceed through routine design choices. Ask only if an unresolved product decision materially changes the requested behavior or a genuine blocker prevents implementation.

## Observed problem and evidence

Any Doctor provides AST-derived bindings, references, function spans and call facts within individual files. Slop supplies its own project-wide consumer guesses through collectImportedNames in doctors/slop.mjs. It searches import text, accumulates names without module identity, approximates dynamic imports by filename, and misses re-export chains.

Two platform behaviors amplify this:
1. src/sdk.ts filters tests out of ctx.files.list() by default, so Slop cannot use that inventory to discover test consumers.
2. src/certify.ts always runs fixtures with includeTests: true. Passing those fixtures does not exercise ordinary default-run filtering.

A published 0.1.2 Sift run at HEAD 555ffb36e57a042165d3b9873b4641f31b3451f9, with an existing generated declaration modification, scanned 690 files and returned 179 info findings: 80 duplicate locations and 99 exports with no detected consumer. Independent review classified the exports as 54 source exports with test references, 41 with no named caller found, three missed re-exports, and one generated artifact. These are observations on that snapshot, not release targets or universal precision measurements.

All 80 Sift duplicate sites matched under an independent TypeScript token comparison and formed 29 groups. Their actual usefulness varied considerably; many were tiny generic helpers.

The local implementation also reproduced these isolated failures:
- A helper imported and called by a .test.ts file is flagged in a default run and disappears with --include-tests.
- helpers.ts exports helper; index.ts re-exports it as publicHelper; app.ts imports and calls publicHelper. Slop incorrectly reports helper as unconsumed.
- a.ts and b.ts each export a different helper with the same name. An import from b.ts masks the genuinely unconsumed export in a.ts.
- a/helper.ts is unused, while b/helper.ts is dynamically imported. The matching basename incorrectly suppresses the finding in a/helper.ts.
- dist/utility.js exporting generatedOnly is reported as authored cleanup.
- Two functions with the same name and signature that respectively replace "a b" and "ab" are incorrectly reported as identical. collectHelperBodies removes whitespace inside literals through replace(/\s+/g, "").

The existing Slop verify command passed 31 result rows and skipped eight location-coverage rows for undeclared reporting units despite these failures. Reproduce rather than assume these observations remain current.

Prior audit artifacts, if still available, are supporting evidence only:
- /tmp/sift-slop-012.json
- /tmp/sift-slop-012-with-tests.json
- /tmp/sift-slop-012-review.md
- /var/folders/gr/00djkpxs7ngdwdnbx719gjg80000gn/T/any-doctor-consumer-probes-rl5m2yz3/results.json
Create repository-contained sanitized reproductions; final verification must not depend on these temporary paths.

## Implementation requirements

### 1. Separate diagnostic scope from reference evidence

Keep the default policy of not diagnosing test code where appropriate, but let analysis inspect tests as potential consumers of production code. Likewise, generated modules may contain real consumer edges even though their declarations should not be presented as authored cleanup.

Implement explicit, shared file-role/analysis-scope policy, rather than a private filesystem walk in Slop or globally enabling --include-tests. Expose the distinction through a small interface with clear semantics. Preserve current confinement: repository-scoped reads through the host, no doctor-side imports, subprocesses, network, or writes. Respect explicit exclusions and surface their coverage implications. Avoid including generated output as an additional set of authored dead-export targets.

Completion: a default scan recognizes a real test consumer without emitting unrelated diagnostics against tests; generated consumers are handled without producing generated-source cleanup noise.

### 2. Add reusable project-wide consumer facts to the host

Own resolution and cross-file relationships in Any Doctor's shared analysis layer. Extend DoctorCtx and the host protocol so Slop can ask about a specific exported binding's consumers without implementing its own resolver. Use the project's existing parser/analysis machinery where suitable; choose dependencies based on demonstrated resolution needs and document the tradeoff.

The supported path must handle:
- Actual module identity, named/default imports, aliases, and type/value distinctions.
- Named re-exports, renamed re-exports, export-star chains and cycles, and supported namespace member use.
- Relative module resolution and common JS/TS extension/index behavior.
- Applicable tsconfig path aliases and workspace/package entry-point configuration. Define supported resolution modes explicitly and report unsupported configurations rather than guessing.
- Statically resolvable dynamic imports and directly identifiable member consumption. A same-name file elsewhere must never count as the imported module. TypeScript import-type expressions must not masquerade as runtime consumption.
- External/public entry points and framework-loaded modules. Honor declarative configuration or explicitly supported conventions; absence of internal imports alone cannot establish that a public export is unused.

Return evidence and coverage, not a single isUnused boolean. Distinguish observed runtime consumers, test consumers, type consumers, public entry-point exposure, no consumer found within supported coverage, and uncertainty. Exact interface naming is your choice; record its invariants before implementing it.

A re-export is a real dependency edge even if no downstream caller is found. Removing only its source declaration would break the re-export. Keep 'no final caller found' separate from 'safe to delete this declaration.'

Unresolvable dynamic access, escaped namespace values, unsupported resolution, and parse failures must never be silently treated as proof of absence. Bound uncertainty to the affected analysis where possible and expose its reason. Avoid making the entire project invisible because one unrelated file is uncertain. Preserve loud failure behavior for infrastructure/parse errors unless an explicit partial-coverage model makes the incomplete result visible on every surface.

Cache appropriately within a scan, terminate cycles, and keep resolution confined to authorized files. Do not execute target-project configuration or fetch dependencies as part of scanning. A full type checker, arbitrary program execution or whole-program call graph is not required. Supported syntax can use bounded analysis; unsupported forms must abstain honestly.

Completion: Slop consumes shared facts, supported relationships resolve by identity, and unknown cases cannot produce an unqualified no-consumer claim.

### 3. Migrate Slop and tighten its factual claims

Replace Slop's global imported-name set and basename matching with the shared consumer facts. Keep Slop responsible for the policy of what deserves a finding, and keep language/module facts in the host.

- Real test-only use must not be described as 'no consumer.' Do not introduce a noisy test-only cleanup rule by default. An optional separate policy can be deferred.
- Re-exports, public entry points and uncertainty must be accounted for before an export is presented as a cleanup candidate.
- Preserve detection of genuinely unconsumed exports within supported coverage. Do not obtain a passing evaluation by switching off the check, exempting broad directories arbitrarily, or treating unrelated same-name imports as consumers.
- Explain evidence and material limits in human and machine output. Ensure agent handoff prompts do not turn a candidate into an automatic deletion instruction.
- Do not imply that an export finding authorizes deletion of an entire module or a side-effecting initializer.
- Update check revisions/identity semantics where the meaning changes, according to the existing finding lifecycle. Existing decisions must not silently apply to materially changed evidence or claims.

Completion: all reproduced consumer failures are corrected or explicitly classified as unsupported, with preserved positive controls and no misleading deletion advice.

### 4. Repair duplicate comparison and retain meaningful suggestions

Use AST/token-aware comparison that preserves literal contents and lexical meaning. Whitespace in strings, template literals and regexes must survive; comments and harmless formatting must not create semantic collisions. Respect actual function ranges, including same-line surrounding code.

Retain positive controls for genuine duplicate functions. Verify differing captured bindings do not become a claim of behavioral equivalence. Wording should establish duplicated source structure, not prove the functions share a contract or can safely be merged.

Inspect the existing triviality threshold: declaration/signature length alone should not turn a one-line generic helper into a substantive maintenance concern. Define and test a conservative policy for suppressing trivial noise while retaining the substantial schema/request-validation examples. Report the tradeoffs rather than tuning a threshold to hit a desired Sift count.

Keep grouping and presentation changes bounded. Preserve every affected location and decision identity; a broad dashboard redesign is out of scope.

Completion: the literal-whitespace counterexample is clean, real substantial duplicates remain detectable, and suggestions avoid overclaiming consolidation safety.

### 5. Make the reliability gate exercise actual behavior

Write labeled regression expectations before changing detectors. Cover positive and negative cases, not only the six examples above. Include aliases, shadowing, barrel chains/cycles, type-only references, namespace escape, same-basename modules, generated consumers, entry points, unavailable analysis and resolution failures.

Keep fixture isolation, but add a way to exercise ordinary scan defaults as well as --include-tests. Use actual CLI/host/doctor execution for integration coverage; testing only an internal resolver is insufficient.

Declare Slop reporting units accurately and provide appropriate passing witnesses. Do not count skipped checks as passed or mislabel occurrence checks to avoid location coverage. Distinguish unavailable engine, unsupported analysis and a fully exercised clean result.

Do not delete failing counterexamples, loosen expectations to current output, or add blanket suppressions to make certification pass. If an existing expectation encodes a wrong contract, explain its correction explicitly.

## Validation and acceptance

1. Capture before/after results on the same frozen Sift snapshot. Preserve the snapshot's commit/dirty-state provenance and a manifest or digest identifying the exact scanned files. Keep generated evidence fixtures deliberate; exclude secrets and unrelated local artifacts.
2. Verify through the normal local CLI and the exact packed npm artifact installed in a clean temporary consumer. Use a fixed published 0.1.2 baseline rather than a moving latest tag. Record source commit, package version, artifact digest, engine/dependency versions, scan flags, exclusions, failures and limitations.
3. For each changed finding in the frozen comparison, classify it as corrected false positive, preserved/missed positive, intentional narrowing, new review candidate, or regression. Inspect new findings against source. Counts and score changes alone are not acceptance evidence.
4. Run the repository's required build/type checks, full automated suite and Slop verification. Rerun other bundled doctor verification sufficiently to detect shared-interface and scope regressions; repair regressions introduced by this work, while keeping unrelated doctor improvements out of scope.
5. Record time and memory observations for the shared consumer analysis on the representative snapshot. Identify unsupported project layouts and remaining coverage limits. Do not claim broad performance or precision from one repository.
6. Review the final diff against this contract and repository standards. Update the architecture/reliability documentation where meaning changed, including the exact supported resolution scope and candidate semantics.

Acceptance requires executable evidence for the known failures, preserved meaningful positive cases, no unexplained regressions in the frozen comparison, and successful packed-artifact behavior. A smaller report, a higher score, or passing self-authored fixtures alone is insufficient. If something cannot be completed, identify the exact unmet requirement and evidence; do not label the whole task complete.

## Return a reviewable candidate

An independent agent will retest your finished candidate. Return:
- Exact checkout/worktree path, branch, base SHA, final implementation SHA, and working-tree status. Keep the candidate's executable source committed and stable for review.
- A concise explanation of which responsibilities moved into Any Doctor and which remain in Slop.
- Reproduction and validation commands, plus repository-relative links to sanitized evidence.
- Packed artifact path and digest, and which source commit produced it.
- Per-case before/after results, changed-finding classifications, and separate passed/failed/skipped counts.
- Supported resolution/coverage boundaries, remaining risks, and any acceptance item not met.
- Confirmation that publication/deployment did not occur.

Keep implementation evidence distinct from independent evaluation. Your report enables the follow-up audit; it is not proof of universal correctness or independent sign-off.
