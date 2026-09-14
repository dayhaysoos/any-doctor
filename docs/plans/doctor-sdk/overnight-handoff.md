# Overnight Doctor SDK implementation handoff

Implement the Doctor SDK foundations on the existing local branch
`feature/doctor-sdk-foundations`. Work through the checkpoints in order and keep
one local commit per completed checkpoint. Do not push, publish, deploy, change the
package version or modify live/frozen Sift.

## Read first

1. [Design](design.md): ownership, interface, invariants and non-goals.
2. [Milestones](milestones.md): the ordered checkpoint loop and exact completion
   criteria.
3. [Baseline](baseline.md): immutable cases, historical counts and source
   adjudications.
4. [Doctor reliability](../../doctor-reliability.md).
5. [Structural call facts](../../call-structure.md).
6. [Current Async verification report](../../evidence/async-modernization/verification-report.md).
7. `CONTEXT.md`, especially Doctor contract, DoctorCtx, Analysis query and the
   planned Doctor SDK terms.

## Authority and preservation

The branch was created locally from `main` at
`d4536b196dd86e8d9ae36b8774bbce06e8b9a5c2`. Recheck this state before work and
record any drift. Existing committed work on consumer analysis, call structure,
value flow, Convex modernization, Async modernization and documentation is input,
not disposable scaffolding.

You are authorized to edit, test, build, pack and create local checkpoint commits
on this branch. Keep every change within the Doctor SDK plan. Preserve unrelated
working files and the original test labels. Do not reset, rewrite history, switch
the checkout to another task branch, push, publish, deploy or make provider calls.

`/tmp/any-doctor-frozen-sift` and any live Sift checkout are read-only evaluation
targets. Verify the frozen target against
`docs/evidence/consumer-analysis/sift-manifest.json` before and after scans.

## Execution rule

Run checkpoint 0 first. For checkpoints 1-8, do all implementation and evidence
required by that checkpoint, pass its gate, inspect the diff and commit it locally
before opening the next checkpoint. If a gate fails, stay in that checkpoint. If
meeting it requires a type engine, whole-program interpreter, broad unrelated
refactor or weakened expectation, record the blocker and stop the overnight run
at the last green checkpoint.

Use the smallest interface that hides recurring mechanics. Add behavior through
the existing `DoctorCtx` confinement seam. Doctors cannot import implementation
modules. Keep framework meaning in the doctor and parsing, identity, value
relationships, coordinates and uncertainty in the host.

Treat every semantic question as known or unknown with evidence. Only a known
result can support a categorical finding. Unsupported flow produces an explicit
unknown/narrowed result while unrelated positives continue to run.

## Verification requirements

At every checkpoint, run focused tests, the affected doctor verification, the full
test suite and all-doctor verification. Build and install a fresh packed artifact
for every public `DoctorCtx` or recipe change, then repeat the affected evaluation
through that installation's explicit CLI and doctor paths.

Minimum commands from the repository root:

```sh
npm test
node bin/cli.js verify --all
node bin/cli.js run doctors/async.mjs /tmp/any-doctor-frozen-sift --format json
```

Use fresh output directories. Capture stdout, stderr, command exits and JSON
passed/failed/skipped counts. A zero command exit does not override failed JSON
expectations. Use `npm pack --ignore-scripts --pack-destination <fresh-dir>` and
install the canonical absolute tarball path into a fresh temporary consumer with
scripts, audit and funding disabled.

The previous independent runners may still be available at
`/private/tmp/any-doctor-async-independent-now-2_h4quo_`. Copy them into fresh
evidence paths before running because they write beside themselves. The durable
case contract is [baseline](baseline.md); recreate it exactly if temporary files
are unavailable.

Every repaired case must retain a nearby genuine positive. Reject a solution that
passes by suppressing the check, broadening unknown globally or changing expected
labels. Preserve initial failures and any corrected evaluator mistake as evidence.

## Deliverable

Finish at checkpoint 8 or the last completed checkpoint. Leave the branch clean
with one local commit per green checkpoint. Update the final evidence with:

- branch, starting/final HEAD and ordered commit list;
- working-file, doctor, provider and tarball digests;
- separate local and packed passed/failed/skipped counts;
- every original and fresh counterexample result;
- reduced/unavailable-analysis outcomes;
- frozen-Sift retained/removed/added findings with source classifications;
- performance and package-size comparison;
- known false positives, missed candidates, unknowns and coverage limits;
- an independent-retest command set for the exact final tarball;
- a clear verdict: ready for independent review, stopped at checkpoint N, or
  blocked by an explicitly named missing capability.

Implementation-authored green evidence is readiness for independent review. It is
not permission to publish and not proof of universal correctness.
