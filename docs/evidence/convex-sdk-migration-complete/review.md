# Final two-axis production review

Fixed point: `0d69f9f0986e151ecd841872df0d705afbad9128`.
Initial flow-review candidate: `c023c64` (full SHA in summary.json).
Initial diff: `git diff 0d69f9f0986e151ecd841872df0d705afbad9128...c023c64`. Final convergence review extends through `5c1350de69c741fdbd6a4517c783436273338399`.
Specification: attached continuation request, preserved in the raw evidence bundle.
Standards: CONTEXT.md, docs/doctor-sdk.md, docs-site doctor authoring contracts, plus the code-review skill smell baseline. Both agents were read-only; all fixes were made in this task.

## Standards

Initial P1: query chains used only definite context, silently discarding a reassigned alias while preserving its positive neighbor. Follow-up P1: assignment-only builder origins were ignored without an initializer. Both violated unknown-is-not-absence. Original CLI counterexamples were retained and reproduced before repairs.

Final reviewer result: no remaining actionable standards findings. The assignment-only reproduction now has one unbounded-collect/unresolved-identity occurrence, incomplete=true, null score/grade, and no speculative finding. Traversal uses SDK binding/value facts; typed unions retain alternatives and apply per-method certainty.

## Spec

Initial P1: conditional context and builder origins could produce 0 findings, no narrowing and 100/Excellent. Mixed helper input could create a confident finding. These were fixed with candidate chain traversal and explicit uncertain ownership. Original neighbors retain exact columns174/178; mixed helper records coverage only.

Final reviewer result: no actionable specification findings. Independently reran151 controls,151 passed/0 failed/0 skipped; `/tmp/convex-spec-final-focused-151/results.json`. Assignment-only flow preserves uncertainty, common typed-union methods retain definite findings, and operations supported by only some alternatives narrow the affected check.

Standards:2 initial findings,0 remaining. Spec:1 initial finding,0 remaining. Findings overlap but axes remain separate.

## Final real-source convergence repair

The first fully reviewed traversal candidate (`c023c64`) exhausted the default heap on frozen Sift. This failed scan is retained under candidate-2. A minimized real-CLI seed with nine `builder = builder.filter(...)` assignments failed with a128MB heap in6.3seconds; its automated regression failed before the fix.

The corrected traversal caches finite semantic states instead of enumerating path permutations. The key retains every attribute used by query classification and location selection. The minimized replay passes in451ms with the same128MB heap and retains its exact positive neighbor plus check/file-scoped uncertainty. The full Sift scan returns124 findings in13.6seconds during concurrent suite execution, with no heap override. All1,530 source entries still match.

Standards convergence re-review: no actionable findings; independently reran the regression,1/0 in507ms. Finite states repair this reproduction; they do not establish constant cost for arbitrary source. Spec convergence re-review is recorded in final summary.

Spec convergence re-review: no actionable findings; independently expanded to20 assignments,464ms at128MB, no crash, sole exact neighbor and scoped uncertainty retained. Final production candidate: `5c1350de69c741fdbd6a4517c783436273338399`.
