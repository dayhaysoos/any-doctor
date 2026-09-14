# Doctor SDK implementation milestones

Read [design](design.md) first. Execute these milestones in order on one branch.
Each milestone is a vertical slice: host fact, `DoctorCtx` interface, one real
doctor behavior, focused tests, consumer verification and evidence. Finish its
gate before editing the next milestone.

Use the leading word **checkpoint** throughout the work. A checkpoint is a local
commit whose implementation, tests, generated runtime and evidence satisfy that
milestone. Keep the commits separate until independent review.

## Common checkpoint loop

For every milestone:

1. Record the starting commit and working-file hashes in a fresh evidence folder.
2. Reproduce the named failing and passing examples before implementation.
3. Implement the smallest complete vertical behavior.
4. Run focused module tests and the affected doctor verification.
5. Run `npm test` and `node bin/cli.js verify --all`.
6. Pack current working files, install the tarball by canonical absolute path in
   a fresh temporary consumer, and repeat affected doctor checks through its
   explicit CLI and doctor paths.
7. Compare changed frozen-Sift findings against source and verify the snapshot
   manifest before and after any milestone that changes findings.
8. Confirm the candidate files did not drift during the gate. Record commands,
   exits, JSON counts, hashes and remaining limits.
9. Commit the completed checkpoint locally. Continue only from a clean index and
   working tree.

An implementation command succeeding is not a passing evaluation when its JSON
contains failed expectations. A reduced-analysis disagreement remains a failure
against the old expectation even when the new product behavior intentionally
abstains; verify the visible unavailable-coverage contract separately.

If a checkpoint cannot satisfy its positive controls without broad suppression,
or requires a whole-program/type engine outside this plan, record the blocker and
stop. Later milestones must not hide an unfinished earlier milestone.

## Checkpoint 0: fixed baseline

Purpose: bind the candidate and preserve the evaluation before changing behavior.

Deliver:

- a repository evidence directory for this run;
- copied, unchanged original Async challenge runners and expectations;
- the fresh cases in [baseline](baseline.md) as executable seeds;
- current local, packed and frozen-Sift outputs;
- branch, HEAD, Node/npm versions, working-file manifest, doctor digest and
  tarball digest;
- a command ledger and source adjudication of every current Sift finding.

Gate:

- the retained 55 behavioral and two location cases reproduce their expected
  current results;
- the 20 fresh cases reproduce 9 passed and 11 failed on the starting candidate;
- every fresh case's unrelated positive remains detected;
- local and packed results match;
- all 1,530 frozen-Sift files match the canonical manifest.

No product behavior changes in this checkpoint.

## Checkpoint 1: semantic result and identity

Purpose: establish the common `known`/`unknown` contract through the real confined
doctor interface.

Deliver:

- one versioned semantic result type with bounded evidence and named unknown
  reasons;
- a host-owned identity query that distinguishes a supported global/import from
  local, shadowed and unresolved references;
- `DoctorCtx` transport, generated declarations and JSON-safe serialization;
- one small Async identity use, preferably native `fetch`, migrated to the query;
- availability and narrowing surfaced in JSON and prose.

Gate:

- real global, immutable alias, local lookalike, shadowed global and unresolved
  cases have distinct expected results;
- an unresolved result cannot enter the absence-reporting path;
- unavailable analysis names the affected check without emitting a finding;
- legacy custom doctors still load and run;
- local and packed results match.

Commit subject: `doctor-sdk: add semantic result and identity checkpoint`

## Checkpoint 2: expression disposition

Purpose: classify ownership changes expressed without a function-call boundary.

Deliver:

- value disposition outcomes `consumed`, `transferred`, `discarded`, `unknown`;
- support for direct return, `return await`, conditional results, yield, direct
  discard, void, length/property extraction and direct await;
- Async promise-array integration using the query rather than doctor-local span
  inference.

Required cases:

- `return-await-array`, `return-await-inline`, `return-choice-array` and
  `yield-array` become silent transfers;
- `return-void-array`, `return-length-array` and `await-array-only` remain findings;
- direct return, direct discard and `Promise.all([tasks])` retained controls remain
  unchanged.

Gate: all required cases, original Async cases, all-doctor verification, npm tests
and fresh installed-package checks pass.

Commit subject: `doctor-sdk: classify expression value disposition`

## Checkpoint 3: call and helper disposition

Purpose: follow ownership across supported argument, spread and local-helper
relationships.

Deliver:

- call-argument roles, including `SpreadElement` without confusing spread with a
  nested array;
- local parameter/rest-parameter substitution;
- supported return propagation from a called local helper;
- supported array storage/transfer relationships needed by the fixed cases;
- unknown transfer for unresolved external consumers;
- native consumer identity that rejects shadowed `Promise.all` lookalikes.

Required cases:

- `spread-helper-consumption`, `spread-opaque-consumption`,
  `push-spread-consumption` and `combiner-spread-arguments` become silent;
- a local helper that ignores its parameter remains a finding;
- `Promise.all([tasks])`, `Promise.all([tasks.length])`, an outer callback and a
  shadowed combiner remain findings;
- unresolved transfers abstain while an unrelated positive remains detectable.

Gate: all fresh promise cases pass locally and packed. Remove the corresponding
private `arrayUse` reasoning from Async; do not leave two competing implementations.

Commit subject: `doctor-sdk: follow supported value transfers through calls`

## Checkpoint 4: resource lifetime

Purpose: match acquisitions and releases by identity and actual execution path.

Deliver:

- resource acquisition/release query with exact handle relationships;
- immutable handle aliases, returned cleanup, called local helpers, helper
  parameters and supported cleanup factories;
- distinct outcomes for released, unreleased and unknown;
- React effect and timer meaning retained in Async rather than hard-coded into a
  universal host fact.

Required cases:

- `timer-cleanup-call-parameter` and `timer-cleanup-factory` become silent;
- qualified cleanup and the three corrected Sift timers remain silent;
- wrong handle, shadowed handle, shadowed clear function, uncalled helper and
  overwritten handle remain findings;
- unresolved conditional or opaque cleanup reports uncertainty rather than a
  proven leak.

Gate: all timer cases pass locally and packed. Inspect any frozen-Sift delta. The
deliberate theme-transition timer remains a contextual review candidate unless
new evidence establishes a stronger conclusion.

Commit subject: `doctor-sdk: add resource lifetime analysis`

## Checkpoint 5: option presence

Purpose: establish option presence without confusing unsupported object flow with
absence.

Deliver:

- ordered option lookup through supported variables, spreads and constructors;
- applicable inherited-property handling or explicit unknown classification;
- mutation, reassignment, getters, dynamic properties and escapes retained as
  unknown where unsupported;
- Async fetch integration using the common identity and option queries;
- informational policy wording kept separate from evidence of absence.

Required cases:

- `fetch-prototype-signal` becomes silent or explicitly unknown without a finding;
- inherited null and own null override remain absence candidates;
- Request-carried signals, ordered spreads and known options remain silent;
- forwarded, mutated and escaped options remain unknown;
- real signal absence remains an informational positive.

Gate: all fresh fetch cases pass locally and packed. Review every frozen-Sift
fetch addition/removal against source; a lower count is not itself success.

Commit subject: `doctor-sdk: establish structured option presence`

## Checkpoint 6: recipes

Purpose: make the proven SDK usable by a new doctor without copying semantic
algorithms.

Deliver:

- unhandled-value, resource-without-release and required-or-recommended-option
  recipes;
- serializable recipe configuration compatible with confinement;
- standard evidence, occurrence reporting and unknown handling;
- Async migrated as the first real consumer;
- a small second consumer or synthetic reference doctor for each recipe to prove
  the interface is reusable.

Gate:

- recipe-based Async produces the same accepted results as checkpoints 2-5;
- Async no longer owns private identity, option, resource or value-flow models;
- the second consumer exercises the same interface with different names and copy;
- deleting a recipe would force substantive logic back into both consumers;
- there is no finding delta caused solely by the extraction.

Commit subject: `doctor-sdk: add reusable semantic check recipes`

## Checkpoint 7: automatic challenge profiles

Purpose: make common adversarial verification automatic for future authors.

Deliver:

- one challenge profile per recipe;
- selection through declared recipe/capability metadata;
- exact finding-count and location assertions;
- positive neighbors beside unknown and lookalike cases;
- human and JSON output naming every exercised and unavailable profile;
- a deterministic extension point for maintained, independently labeled cases.

Mutation proof:

- temporarily break identity handling and show the profile fails;
- temporarily map unknown to absent and show the profile fails;
- temporarily suppress a check and show its positive neighbor fails;
- restore the candidate and retain only sanitized failure evidence, not broken
  source.

Gate: all three mutation proofs fail for the intended reason; the restored local
and packed candidates pass every profile. Author fixtures and held-out evaluation
remain separate, visible gates.

Commit subject: `doctor-sdk: certify recipes with challenge profiles`

## Checkpoint 8: final assembly

Purpose: bind one reviewable branch candidate and document the author experience.

Deliver:

- the full local and packed verification matrix;
- unchanged original/fresh labels and source seeds;
- frozen-Sift before/after comparison with every delta adjudicated;
- performance comparison for parse/analysis time, peak memory and artifact size;
- current limitations and unavailable behavior;
- authoring documentation showing one minimal example per recipe;
- a final working-file manifest and evidence archive;
- a handoff for independent review of the exact tarball.

Final gate:

- npm test passes;
- all bundled doctors verify with no new skipped coverage;
- original 55 behavior and two location cases pass;
- all 20 fresh cases pass, including positive neighbors;
- recipe challenge profiles pass;
- local and packed findings match;
- frozen target integrity passes;
- every changed real-source finding is classified;
- no known false assertion remains in the evaluated corpus;
- known missed candidates and unknowns are reported separately;
- the branch is clean and each checkpoint is a separate local commit.

Commit subject: `docs: complete Doctor SDK candidate evidence and authoring guide`

## Evidence layout

Use one run root under `docs/evidence/doctor-sdk-foundations/<candidate-id>/`.
Within it, keep one directory per checkpoint:

```text
00-baseline/
01-semantic-result/
02-expression-disposition/
03-call-disposition/
04-resource-lifetime/
05-option-presence/
06-recipes/
07-challenge-profiles/
08-final/
```

Each directory contains a machine-readable manifest, command ledger, result counts,
focused outputs and a short `verification-report.md`. Large installed dependency
trees and temporary consumers remain outside the repository; record their package
and file digests. Sanitize paths and secrets before committing evidence.
