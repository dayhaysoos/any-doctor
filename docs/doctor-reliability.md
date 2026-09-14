# Doctor reliability protocol

A passing fixture suite establishes agreement on its cases. It does not establish
precision on arbitrary repositories. Treat every check as a bounded claim.

The [Doctor SDK foundations](doctor-sdk.md) move recurring identity, value-flow,
resource and option mechanics into host-owned semantic queries and certify three
reusable recipes with metadata-selected challenge profiles. The implementation
on its feature branch is a review candidate, not a published compatibility
promise; the [design](plans/doctor-sdk/design.md) remains the governing boundary.

The [vision](vision.md) includes project-specific policies and contextual review
candidates alongside defects. Reliability means the evidence supports the stated
interpretation; it does not require removing every useful judgment call from the
product. Severity and certainty are different concepts.

## Before implementing a check

State the observable condition, the reporting unit (occurrence, file, or project),
valid lookalikes, required analysis facts, and what happens when those facts are
unknown. Separate bugs from performance or maintenance review candidates. Do not
recommend a fix whose safety depends on facts the check cannot establish.

Use shared AST and binding facts for scope, immediate call use, and identity.
Framework semantics belong in the doctor. A nearby await, Promise.all, or matching
name cannot prove that a specific promise is consumed. Unknown cases must narrow
the claim or abstain explicitly.

## Required evidence

- Write positive and negative examples before adjusting the detector. Include
  returned and passed values, shadowed names, comments, strings, aliases, nested
  scopes, and unrelated nearby constructs when relevant.
- Occurrence checks need a passing fixture with two distinct positions of the
  same check in one file. Use identical offending text where possible to catch
  text-based deduplication. Same-line occurrences require distinct columns.
- File and project checks need positive witnesses. Declare the actual unit;
  choosing a broader unit must not hide lost occurrences.
- Pin unavailable-analysis behavior separately. Skipped coverage is not a pass.
  Legacy checks without a declared unit are reported as not exercised.
- Keep independently identified real bugs in the sensitivity corpus and valid
  counterexamples in fixtures or the innocent corpus. Author-written fixtures
  alone cannot measure precision. Maintain held-out, independently labeled cases.

## Before release

Run the complete suite, build and pack the exact candidate, and execute that packed
artifact against a real repository. Compare with the previous published version
using a fixed target checkout. Classify added and removed findings against source:
corrected false positive, preserved positive, intentional narrowing, new candidate,
or regression. Counts alone cannot establish improvement. Record versions, target
commit and dirty state, analysis availability, crashes, and unsupported cases.

## Review decisions and reliability (planned)

The [lifecycle proposal](plans/finding-lifecycle/proposal.md) adds accepted and
not-applicable decisions. Preserve their reasons and distinguish the two: an
accepted concern is not evidence that the detector is wrong. A confirmed
not-applicable case should become a counterexample for its rule when appropriate.
Shared decisions change the review view, not raw observations or analysis coverage.
They must not silently teach a doctor to ignore unrelated similar code.

Revalidate decision applicability after relevant source or rule changes. A claimed
fix, a disappearance under comparable coverage, and an accepted finding are
different outcomes. Evaluations and summaries must not count all three as fixes.
Track false positives and preserved positives per check rather than treating fewer
findings or a higher score as proof of improved accuracy.

The initial lifecycle is local and Git-based. Collecting decisions does not
authorize telemetry, uploading source, or automatic global rule changes.

## Current Convex boundaries

Convex revision-2 checks use shared call structure and lexical identity. Supported
registration imports, immutable aliases, local handler/config variables and direct
handlers establish contexts. Database aliases, destructuring, imported context
types (including local aliases and `Pick`), and consistent observed local helper
arguments preserve useful helper findings. Unresolved wrappers, type contracts
and cross-file helper implementations remain unknown. Type annotations describe
intended contracts; they do not establish runtime types.

Validators use actual config properties independent of order and shorthand.
Public validation is recommended; missing internal validators are informational
contract candidates, not client exposure. Node directives come from the program's
directive prologue, not strings appearing after imports or other statements.

Query chains use returned-range relationships. Literal unreachable branches do
not establish bounds. Supported conditional updates that only extend a constrained
range remain bounded. Unresolved returned ranges receive an explicitly uncertain
candidate for that chain, without suppressing unrelated positive findings. Index
ranges do not establish small cardinality, and result limits can omit required
billing/migration work; recommendations preserve complete processing.

Direct discarded promises remain independent of unrelated nearby awaits. Stored,
passed and returned results are outside the direct-discard claim, not certified
settled. Query clocks are subscription/expiry review candidates; transaction clock
subtraction is distinct. Preserve server-authoritative expiry rather than replacing
it with an untrusted client timestamp.

Public server calls are audience/authorization review candidates, never proof
that clients should lose access. Spread checks concern top-level patch fields,
not nested objects or arrays; validators, deliberate state copies and selected
server fields can make them correct. Awaited run loops are identified by same-
function loop ancestry; retries, backoff and cursor-dependent batches may require
sequential execution. All recommendations retain these distinctions.

The framework contracts were checked against current official Convex guidance
and the retained 1.32.0 runtime proof. See [validation](https://docs.convex.dev/functions/validation),
[runtimes](https://docs.convex.dev/functions/runtimes), and
[best practices](https://docs.convex.dev/understanding/best-practices/).
No deployed application, production latency, cardinality or authorization exploit
was tested. Analysis-unavailable runs abstain explicitly. Diagnostic extension
limits for `.mts`, `.cts` and `.cjs` remain separate from this repair.

## Consumer and duplicate reliability gate

Project-wide facts and their exact limits are documented in
[project consumer analysis](project-consumer-analysis.md). Regression labels live
in `dev/consumer-analysis/cases.mjs` and execute through the real CLI in
`test/consumer-integration.test.mjs`. Fixtures can pin default scope with
`includeTests: false`; test consumers must count in that mode. Slop revision 2
uses literal-preserving structural comparison and dependency-aware consumer
facts. Its removed two-statement duplicate expectation is intentional narrowing;
its removed degraded duplicate expectation replaces an inaccurate text fallback.
The original seeds remain, alongside substantive positive/location witnesses.

Source review and comparison artifacts live under `docs/evidence/consumer-analysis`.
They are implementation-authored evidence for follow-up independent evaluation.
