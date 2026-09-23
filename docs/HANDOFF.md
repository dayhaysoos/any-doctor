# Handoff — post-0.2.0 adoption and finding lifecycle

Updated September 22, 2026. Start here when continuing Any Doctor's product
direction, adoption work, decisions, history, identity, or team sharing.

## Current release state

- npm package: `any-doctor@0.2.0`.
- Source release tag: `v0.2.0` at `3f98de0`.
- `main` additionally contains `5b91bf8`, a test-only PTY release-gate
  stabilization; the packed artifact was byte-identical after that change.
- Release verification completed with 1,091 tests, all bundled doctors verified,
  capability-gap certification, packed-consumer checks and a clean diff check.

Recheck npm, HEAD and the working tree before making a new release claim. Evidence
records describe their named candidates; they are not automatically current.

## Read in order

1. [Vision](vision.md): purpose and trust model.
2. [Feature map](features.md): shipped behavior versus planned work.
3. [Lifecycle proposal](plans/finding-lifecycle/proposal.md): user and agent
   workflows.
4. [Lifecycle design](plans/finding-lifecycle/design.md): state ownership,
   identity, Git reconciliation and remaining choices.
5. [Lifecycle milestones](plans/finding-lifecycle/milestones.md): completed M1/M2
   and planned M3/M4 boundaries.
6. [Doctor SDK](doctor-sdk.md) and [Value Path](plans/value-path/design.md): the
   shipped semantic authoring surface.
7. [Bundled doctor modernization](doctor-modernization.md): current shared seams,
   retained domain policy and verification expectations for every doctor.

## What shipped before and in 0.2.0

- M1 identity-aware Git-base comparison with source-bound evidence, conservative
  ambiguity and stale-source handling.
- M2 remembered local accepted/not-applicable decisions, required reasons,
  reversal, reassessment, dashboard and agent/JSON workflows. State is atomic
  JSON, not SQLite; gates remain based on raw findings.
- The Doctor SDK semantic result contract, shared recipes and maintained challenge
  profiles.
- Value Path as a bounded shared property-path query, adopted by Deepgram and
  OpenRouter. A later fidelity audit removed Deepgram's private fallback and
  intentionally narrowed one nested opaque-transfer credential case.
- Locally complete recipe modules behind one registry.
- The bundled doctors use the shared provider consistently: Async is recipe-native;
  Deepgram and OpenRouter use Value Path; Convex retains domain-specific graph
  policy over shared facts; Effect and Slop no longer carry line/brace parsers.

Authoritative architectural decisions are D30–D33 in
[decisions.md](decisions.md). Preserved implementation plans and evidence may
contain older branch names, package versions and baseline counts.

## Immediate phase: adoption

Use real repositories to measure:

- time to the first useful finding;
- false positives and missed findings, classified per check;
- narrowed/unknown cases users expected the tool to answer;
- first-attempt `generate` → `verify` → `run` success for a custom doctor;
- whether users understand and use remembered decisions;
- installation, performance, terminal and JSON friction.

Prefer small `0.2.x` documentation, correctness and usability repairs backed by
reproductions. A new semantic capability starts from a concrete false positive or
miss plus valid lookalikes; Value Path remains bounded rather than growing into a
general JavaScript interpreter.

## Next planned feature: M3 shared project decisions

M3 makes selected decisions reviewable Git-tracked project state and applies them
consistently in fresh checkouts and CI. It must preserve private local decisions,
raw findings, doctor confinement and one-off read-only scans.

Before implementation, resolve and record:

- shared record layout and deterministic serialization;
- doctor namespace/rename identity;
- semantic conflict behavior after textual Git merges;
- branch/worktree reconciliation and deletion;
- read-only CI application and whether shared decisions affect gates;
- raw, active and reviewed score presentation.

M4 bounded history is separate. It is the point to reconsider SQLite or another
indexed local store; M3 does not require a database merely to share decisions.

## Completion evidence for future slices

Bind the exact candidate and target, reproduce the motivating case, run focused
and full tests, verify all doctors, build and pack, exercise a clean consumer and a
representative real repository, review the actual diff, and record limitations.
Publication and version changes remain separate maintainer actions unless a task
explicitly authorizes them.
