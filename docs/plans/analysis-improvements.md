# Analysis improvements before persistent decisions

Status: A1 + A2 (the first delivery below) is implemented on branch
`implement/analysis-a1-a2` — see D30 (including its identity-repair
amendment) in [decisions](../../decisions.md) for the accepted choices,
evidence, and remaining limitations. An adversarial review's four findings
(literal-preserving normalization, execution-bound provenance/evidence,
evidence ranges for multiline expressions, linear duplicate matching) are
repaired with the review's probes as regression tests. Later analysis
capabilities remain separate work, not prerequisites for local decisions
or team sharing.
Read [vision](../vision.md), [reliability](../doctor-reliability.md), and the
[lifecycle design](finding-lifecycle/design.md) for the surrounding contract.

## Goal and first completion point

Make findings better supported and recognize the same occurrence across source
movement without conflating different occurrences. Prove the behavior through
the current stateless `--base` workflow before storing or sharing decisions.

The first delivery is complete when a moved, unchanged finding is no longer
counted as removed plus added, a newly introduced identical occurrence remains
new, uncertain matching stays visible, and exact fixture verification still
rejects incorrect locations. No database, dismissal storage, or shared-decision
format is needed for this delivery.

Richer analysis supports more precise claims; it does not establish whether every
abstraction is justified or every duplicate should be consolidated. Two engines
agreeing on syntax is not independent proof that a finding needs a code change.

## What exists today

Inspected at source HEAD `4adf69cd2f3f565681eca8260ef78a8729d6de4a`. Recheck the
candidate before implementation; these are code pointers, not permanent limits.

| Module | Existing capability or constraint |
| --- | --- |
| [contract](../../src/contract.ts) | Search matches include text, captures, and optional end coordinates; Finding has a start location, rule, message, and severity. No durable identity/evidence contract. |
| [engine](../../src/engine.ts) | Batched structural search through ast-grep; complete JSON output buffered with a 256 MB ceiling. |
| [analysis](../../src/analysis.ts) | oxc-parser plus TypeScript-aware scope-manager: bindings/references, function spans, immediate call use, receiver identity, and selected expression relationships. Not full type checking. |
| [analysis host](../../src/analysis-host.ts) | Separate in-process caches for fact models, keyed by mtime and size. Not a content-addressed source snapshot shared with ast-grep. |
| [diff](../../src/diff.ts) | Base and current findings compared through location-based compareFindings. |
| [certify](../../src/certify.ts) | Uses compareFindings for strict fixture/corpus expectations; this exactness must survive. |
| [runner](../../src/runner.ts), [report](../../src/report.ts) | Findings are materialized and transferred/rendered as complete results; storage changes alone cannot bound their memory. |

## A1 — Source evidence, anchors, and compatibility

### Ownership and contract choice

The host owns source snapshots, coordinate normalization, evidence validation,
and canonical anchors. Doctors retain their confined, read-only analysis contract.
The doctor owns which observed condition and related source regions justify its
claim. Define explicitly how that evidence reaches the host before choosing IDs.

Evaluate two compatible paths: host-derived anchors from a reported location,
and optional doctor-supplied source ranges/capture references validated by the host.
A hybrid is the starting proposal. Existing doctors must remain runnable without
rewrites; optional fields must not imply full identity support where only a coarse
legacy location is available. Document the supported fallback and uncertainty.

The implementer must settle the Finding extension, if any, and its JSON/protocol
compatibility. Keep host-derived identity/provenance distinct from doctor-supplied
assertions. Update contract types, glossary, authoring skill, and relevant bundled
examples for any accepted extension. Do not require each agent-authored doctor to
implement hashing, scope resolution, snapshot handling, or matching algorithms.

### Evidence to preserve

- Doctor namespace and rule, with actual implementation/configuration provenance.
- Root-relative file identity and source-content digest for the bytes examined.
- Exact primary expression range and bounded related ranges/captures when supplied.
- Node kind and enclosing structural context when analysis establishes them.
- Receiver/declaration relationships already available from the analysis host.
- Evidence/matching schema version and explicit available/unsupported/ambiguous state.

Preserve distinctions: a structural anchor helps find an occurrence again; an
evidence digest determines whether the reviewed condition still has the same
relevant content. A rule implementation digest records what ran; it does not by
itself establish whether a change was semantically compatible.

### Snapshot and coordinate integrity

Join engine facts only for the same source content. Decide whether to read from
an immutable temporary snapshot or detect changes and retry/invalidate affected
work. A file edited during analysis must not produce a confident finding assembled
from old ast-grep matches and new OXC bindings. HEAD alone misses dirty source;
mtime plus size alone is insufficient evidence of content identity.

ast-grep exposes UTF-8 byte ranges; the current analysis model declares UTF-16
offsets. Choose a canonical representation and test conversion, exclusive ends,
non-ASCII characters, emoji, CRLF, and multiline expressions. Validate ranges
against the source snapshot. Parser recovery, unavailable analysis, or unmatched
nodes must not turn a guessed correspondence into a confident anchor.

Retain bounded evidence, not complete ASTs in every finding. Reuse parsed facts
where useful, with explicit memory limits; do not eagerly build a repository-wide
graph for each structural match.

### Identity and rule compatibility

Design conservative, versioned matching that uses the finding's namespace, rule,
structural context, and relevant content. Neither line numbers, normalized text
alone, nor a whole-file hash is sufficient. Preserve literal/operator meaning;
normalization must not erase a change from a safe condition to an unsafe one.

Separate identical occurrences, including multiple matches in one function or on
one line. If copies or structural edits make correspondence uncertain, expose
ambiguity rather than choosing by proximity or collapsing counts. Cross-file
renames and arbitrary refactoring continuity are outside the initial guarantee.

Set a per-check compatibility policy in A1. Evaluate an explicit check revision
and/or host-derived semantic digest; names of new fields are not settled here.
Harmless metadata/comment changes should not automatically invalidate every
decision in a bundled doctor. Changed detection meaning must not retain an old
decision merely because the author forgot to bump a version. Record implementation
provenance regardless; unknown compatibility means reassessment, not silent reuse.
If safe compatibility cannot be established, document conservative invalidation
and its user-visible cost rather than claiming the churn problem is solved.

**A1 completion:** accepted evidence/identity/compatibility contracts, backward
compatibility tests, independent labeled examples, and measured evidence overhead.
Use the current pipeline as the consumer through A2; a standalone identity library
without that integration is not the first completed delivery.

## A2 — Integrate into the existing stateless Git-base comparison

Introduce a separate scan/identity comparison operation. Preserve
`compareFindings` semantics for fixtures: exact rule/file/line matching, explicit
column matching, and the existing omitted-column compatibility. A movement-tolerant
fixture matcher could certify findings emitted at the wrong code location.

Compare the captured current working tree with the materialized Git base using
the same selected doctor implementations and compatible configuration/capabilities.
Keep root-relative identities consistent across the temporary base worktree and
the actual checkout. Capture source/engine/doctor provenance for both sides.

Confidently unchanged moved findings are continuing. New occurrences remain added;
compatible absence is no longer detected. Unknown matching or incomplete coverage
must be visible in both human and machine output. Define conservative `--fail-on`
behavior for uncertain candidates; uncertainty must not silently suppress a real
new finding or produce a successful gate from an invalid comparison.

Show current coordinates and useful before/after evidence without claiming a bug
was fixed merely because a pattern disappeared. Preserve raw findings and score
semantics in this slice; there are no accepted/dismissed findings yet. Unknown
identity does not erase raw results.

### Required acceptance matrix

| Case | Expected outcome |
| --- | --- |
| Blank lines/comments inserted above unchanged code | One continuing occurrence, not added plus absent. |
| Unrelated function changes in the same file | Unchanged occurrence retains confident continuity. |
| Identical text in two modules, or twice in one function | Distinct occurrences; no text-based collapse. |
| Two findings on one line | Independently addressable ranges and identities. |
| Third identical occurrence added | The additional occurrence cannot be hidden; ambiguity is reported if existing copies cannot be mapped safely. |
| Relevant operator/literal/receiver changes | Changed evidence is visible; prior applicability is not assumed. |
| Shadowed receiver or nested callback | Evidence links to the correct declaration and function. |
| Different doctors use the same rule name | Namespace separation prevents accidental cross-doctor continuity. |
| Same-size edit, preserved timestamp, or edit during scan | Source digests/snapshot policy detect stale or inconsistent evidence. |
| Non-ASCII/emoji, CRLF, multiline and TS wrapper expressions | Valid coordinate conversion and attachment to the intended expression. |
| Legacy custom doctor or unavailable semantic engine | Documented conservative behavior; no invented precise anchor. |
| Renamed file or ambiguous duplicate movement | No unproven suppression; continuity may be unknown. |
| Exclusion, failed parse, missing engine, or interrupted base run | No unsupported disappearance/fix claim or false-green gate. |
| Check meaning changed versus metadata-only change | Compatibility policy is exercised and provenance retained. |
| Fixture emits a finding at the wrong line or explicit column | Verification still fails even if identity would match elsewhere. |

## Resource scope for the first delivery

Measure identity/comparison independently and the real scan-to-report pipeline
separately. Large synthetic finding sets validate the former only. Run increasing
real/synthetic source workloads with realistic and deliberately broad patterns;
record file count, match count, peak memory, wall time, and serialized output size.
Establish budgets on named machines before making a capacity claim.

The initial delivery must preserve visible overflow/timeout/partial-scan behavior
and avoid introducing unbounded per-match evidence. Large-codebase support remains
a goal, not a capacity already established by SQLite or a record benchmark.

If intended workloads exceed current limits, open a bounded scanner-scale slice
with an owner and acceptance targets before claiming support. Candidate work is
streamed ast-grep output, bounded request/result transfer, incremental aggregation,
and bounded report queries. ast-grep already supports `--json=stream`, but merely
changing that flag while buffering/parsing the full output does not solve the
pipeline. A1/A2 do not implicitly authorize rewriting the entire engine.

## Later improvements — independently scoped

| Capability | Concrete payoff | Required limits/evidence |
| --- | --- | --- |
| Resolved import/export graph | Distinguish an actual consumer from an unrelated same-name import; follow aliases/re-exports. | Package/tsconfig resolution, entry points, external consumers, dynamic imports, and incomplete graphs must be explicit. |
| Bounded local value flow | Follow a stored promise into the particular awaited collection, or a builder across direct assignments. | Test reassignments, escapes, callbacks, loops, and unknown helpers; a nearby combiner is never consumption evidence. |
| Targeted control-flow facts | Distinguish handling on one branch from handling on all relevant paths. | Account for early returns, throws, and nested functions; syntax order alone is not execution order. |
| Optional type facts | Establish promise-like results and actual API receiver types for selected checks. | A parser is not a type checker. Validate a separate provider's compatibility/cost and declare absent-type behavior. |
| Explicit project context | Respect declared entry points, generated files, framework configuration, and team policies. | Attribute assumptions to configuration; convention alone does not establish runtime behavior or intent. |

Start each extension with a real false positive or missed finding plus valid
lookalikes. Implement reusable host facts and keep framework policy in doctors.
These extensions need not all ship before lifecycle M2/M3. No full-program call
graph, general type engine, database, or automatic global doctor adaptation is
part of the first delivery.

## Implementation handoff and evidence

1. Confirm branch/HEAD, dirty state, runtime, and the current interfaces. Preserve
   the existing documentation work. A1 + A2 is the default scope when the
   maintainer asks to implement this first analysis delivery.
2. Resolve the anchor source/contract and compatibility choices with representative
   examples; record decisions here and in the decision log. Keep the lifecycle
   design's open-choice table synchronized.
3. Exercise the acceptance matrix through real doctor runs and the CLI diff path.
   Keep strict certification tests. Independently labeled/frozen counterexamples
   supplement author-written cases; matching two parsers is not independent labeling.
4. Review the actual candidate against this scope and repository standards, repair
   findings, and rerun affected checks. Build and pack, then run the installed
   artifact on a representative repository such as Sift without altering its code.
5. Record exact provenance, correctness results, performance measurements, known
   unsupported shapes, and added/removed finding classifications. Sift alone is not
   evidence of massive-codebase capacity. Update handoff and feature availability.

This document does not authorize publication, version bumps, lifecycle persistence,
or implementation of every later capability. The current request is documentation;
the maintainer will assign implementation separately.

## Source references

- [ast-grep JSON](https://ast-grep.github.io/guide/tools/json): source ranges,
  captures, UTF-8 byte offsets, and streaming output.
- [ast-grep relational rules](https://ast-grep.github.io/guide/rule-config/relational-rule.html):
  structural relationships; they do not by themselves establish runtime flow.
- [OXC parser](https://oxc.rs/docs/guide/usage/parser): parsing capability.
- [OXC type-aware analysis](https://oxc.rs/docs/guide/usage/linter/type-aware.html):
  a separate capability from the parser used by Any Doctor today. Recheck provider
  support when implementing; this plan does not select a dependency.
