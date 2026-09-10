# Doctor reliability protocol

A passing fixture suite establishes agreement on its cases. It does not establish
precision on arbitrary repositories. Treat every check as a bounded claim.

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

## Current Convex boundaries

Direct-discard detection covers recognized methods on the actual first parameter
of a resolved inline handler. Returned, stored, passed, chained, and custom-wrapper
cases are outside this check's claim; they are not certified safe.

Clock checks distinguish direct query clock reads (reactivity review candidates)
from subtraction of transaction clock reads. Mutation expiration, historical
cutoffs, and Math.random are not generic nondeterminism violations.
See [Convex query caching](https://docs.convex.dev/functions/query-functions#caching--reactivity)
and [Convex runtime behavior](https://docs.convex.dev/functions/runtimes).

Query checks follow a single syntactic chain. They do not infer schema cardinality,
follow builders across statements, or prove arbitrary helper behavior. Collect
findings call for reviewing bounds; they do not prove an existing latency incident.
Generic useQuery calls cannot establish whole-table subscriptions and are no
longer warned against.
