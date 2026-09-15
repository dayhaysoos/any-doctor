# Focused repair review

Base: de4efe8871bc7489eca7f4923f5c20fe3cd015f9.
Final production candidate:505100c32c040a9a8efff3cb30fe50cd4c9bfdac.
Reviewers inspected the working diff subsequently committed unchanged. Final diff command: `/Library/Developer/CommandLineTools/usr/bin/git diff de4efe8871bc7489eca7f4923f5c20fe3cd015f9...505100c32c040a9a8efff3cb30fe50cd4c9bfdac`.
Spec source: request.txt in the raw bundle. Standards: CONTEXT.md, docs/doctor-sdk.md, single-file doctor confinement and the code-review skill smell baseline. Reviews were read-only; no delegated implementation.

## Standards

No actionable findings. Corrected original opaque-range/filter, computed patch, spread patch and no-needs counterexamples were independently rerun. Original scaling seeds completed at128MB:20/80/160/320/1000 assignments in428/447/475/566/1317ms, all exit0 with identical check-level coverage and null score/grade.

The doctor retains confinement and shared-fact ownership. Direct binding/value/call origins are cached; execution-only traversal uses compact states without reporting locations or histories. Three-state joins preserve disagreement, cycles terminate through graph/state identity, and no size cutoff or timeout extension was introduced. Timings support these cases; graph memoization explains the removal of history enumeration.

## Spec

No actionable findings. Retained red evidence was inspected. Independent reruns passed25/0/0 repair controls,23/0/0 SDK tests and5/0/0 scaling cases at128MB.20/80/160/320/1000 assignments completed in558/463/481/565/1317ms. Evidence originally at `/tmp/convex-summary-spec-controls/results.json` and `/tmp/convex-summary-spec-scaling/results.json`, copied into this bundle.

Queries now interpret one completed summary independently; patch analysis preserves definite observations and separately reports unknown field sets. No-needs narrowing is rejected while recipe-implied needs remain supported. Review does not substitute for the separately recorded complete-suite, packed and frozen checks.

Standards remaining:0. Spec remaining:0.
