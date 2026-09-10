# Finding lifecycle: design

Status: planned, not implemented. [Proposal](proposal.md) owns user behavior.
The commitments below define the intended design; schemas, algorithms, command
names, and the SQLite binding remain open until their milestone establishes them.

## Ownership

Doctors emit raw findings through their existing confined, read-only contract.
The CLI owns identity, observations, decisions, reconciliation, and persistence
in a finding-state module. A doctor must not receive filesystem write or database
capabilities merely because the CLI gains persistence.

Keep raw scan evidence separate from review state. The command layer composes the
finding-state module with the existing cohort and presentation flow. Human output,
JSON, and optional gates consume consistent derived state. Avoid independent
decision matching in each renderer. The initial interface needs operations to
record a scan, record/reverse a decision, and query a bounded view; exact types
follow the first implementation slice rather than prescribing a generic storage
framework in advance.

## Data model and authority

These are proposed records, not additions already present in DoctorCtx.

| Record | Meaning and minimum provenance |
| --- | --- |
| Scan | Run ID, source snapshot, target/scope, config digest, doctor/engine revisions, per-check coverage and completion. |
| Finding identity | A durable occurrence identity with a versioned matching scheme, separate from its latest line/column. |
| Observation | A finding detected in a particular scan, its evidence digest and current location. |
| Decision | Finding identity, accepted/not-applicable disposition, reason, local/project scope, applicability evidence, revision, and supplied attribution. |
| Claimed fix | Explanation and optional commit/source reference; a claim distinct from the next scan observation. |

Observation state, review disposition, and claimed remediation are separate axes.
An accepted finding may still be detected. "No longer detected" requires a
comparable completed scan; it is never inferred from a decision alone.

Local SQLite stores observations, bounded history, local decisions, and an index
of shared records. Git-tracked configuration and project decisions are authoritative
for shared intent. Shared records must be sufficient to reconstruct their index
without another machine's database or cached scan. Local decisions/history cannot
be reconstructed from Git; deleting the database loses them unless exported or
backed up. The analysis cache is independently disposable.

The proposed layout is a project .any-doctor directory with tracked configuration
and decisions, and an ignored local state/cache area. Exact filenames and decision
partitioning are open. Grouping records by package and doctor is the starting
proposal; select partitions using merge behavior and large-decision-set benchmarks.
Do not place the database in the ephemeral npx package cache or commit SQLite/WAL
files. A persistence operation can create its files lazily without init.

## Finding identity

The [analysis plan](../analysis-improvements.md) owns the concrete M1 delivery:
host/doctor anchor-source choice, optional Finding evidence contract, snapshot and
coordinate integrity, compatibility policy, and integration into stateless diff.
Its scan comparison must remain separate from strict fixture matching.

Current Finding and diff matching use rule/file/line/optional column. This is not
stable enough for persistent review decisions. Design a versioned identity from
doctor namespace and rule, relevant structural context, and occurrence anchors.
Use the relevant code/evidence fingerprint to assess decision applicability.

Identity continuity and applicability are distinct: moving a function may preserve
identity while changing its body invalidates a prior decision. Identical text in
two places is not one finding. Line shifts should not destroy identity, while an
ambiguous duplicate match must not carry a suppression. A whole-file hash alone
invalidates decisions on unrelated edits; a snippet hash alone conflates copies.

Support conservative fallback for custom doctors and languages without semantic
analysis. Unavailable anchors mean uncertain continuity and visible reassessment.
Rule meaning can change without its public ID changing: record implementation and
configuration digests. Default to reassessment on unknown compatibility; a future
rule compatibility/version contract needs explicit tests before retaining decisions.

## Scan comparability

Capture the actual working-tree content, not only HEAD. Distinguish targets,
exclusions, test inclusion, doctor versions, configuration, engine versions, and
available capabilities. Store enough per-check/file coverage to know whether an
absent finding was eligible for examination. File deletion is an explicit source
change; exclusion and analysis failure are coverage changes.

Keep worktree histories distinct. Branch names help display context but are not
source identities. Unrelated branches are not implicit before/after baselines.
Only the covered, compatible portion of scans can establish disappearance. A
changed doctor can support an explicit detector comparison, not a code-fix claim.
Expired detailed history must be identified as unavailable, not reconstructed as
complete from summary counters.

## Team convergence

For the same source, compatible doctors/engines, configuration, and committed
decisions, a fresh checkout and a warm checkout must apply the same project
decisions regardless of their private histories.

On run/query startup and after relevant local writes, reconcile the database's
shared projection against the exact checked-out files. Reconciliation must replace
removed/changed records as well as add new ones; a blind union resurrects decisions
from other branches. Cache the shared-state digest to avoid redundant imports.

Use deterministic serialization and stable record IDs. Git combines independent
changes; Any Doctor validates duplicate or incompatible decisions even when Git
reports a textual merge as clean. Conflicts fail closed for suppression and are
reported visibly. Timestamp or author name is not a winner-selection algorithm.
Malformed shared records must not silently yield an apparently successful review.

A project decision is durable only after its authoritative file update succeeds.
The SQLite index can then be updated or rebuilt. Writes need atomic replacement
and conflict detection so concurrent agents cannot overwrite unrelated decisions.
Do not claim atomic transactions across Git files and SQLite; recovery must replay
the authoritative files after interruption. Local decisions use SQLite transactions.

Shared CI applies project decisions only. Interactive output identifies local-only
effects. Read-only CI must be able to load tracked decisions using temporary or
in-memory indexing without requiring a preexisting database or writable checkout.
Shared full-run analytics remain outside this design.

## Scale and durability

- Keep current state plus compact change/observation records instead of copying
  every finding and message into every scan. Retained scans must still distinguish
  repeated presence from lack of coverage; use compact membership/coverage records
  or equivalent indexed representation, measured in the scale harness.
- Index the bounded queries agents and the CLI actually need: doctor, package,
  active/reviewed status, run comparison, and finding history. Paginate records and
  limit source excerpts. Totals and continuation markers must expose truncation.
- Store digests and bounded evidence, not repeated complete sources or ASTs.
  Retention may prune older detail and disposable cache; it must preserve current
  decisions/current state or explicitly report inability to do so under a hard cap.
- Perform analysis outside short write transactions. Batch observations, tolerate
  concurrent readers, and serialize writers with bounded contention handling.
  Interrupted scans remain incomplete; no partial commit establishes disappearance.
- Version schemas. Validate shared records and migrate local state transactionally.
  Test interrupted migration and corrupt-state reporting. Never silently reset a
  database containing the only copy of local decisions.
- SQLite selection does not bound the current cohort/report memory. Measure the
  entire pipeline and identify where streaming, spooling, or bounded materialization
  is needed before claiming large-codebase support.

SQLite is local application storage with one writer at a time. Keep each database
on local storage rather than using a shared network filesystem as team sync.
See [SQLite use cases](https://www.sqlite.org/whentouse.html) and
[WAL behavior](https://www.sqlite.org/wal.html). The binding must be validated
against the package's supported Node/platform matrix and isolated npx installation;
using SQLite does not authorize silently raising the Node minimum.

## Decisions still required

| Choice | Resolve by | Required evidence |
| --- | --- | --- |
| Host-derived versus doctor-supplied anchors; optional Finding evidence contract | M1 / A1 — **accepted v1**: host-derived only, no Finding extension (D30) | Legacy doctors, validated ranges, same-snapshot joins, and Unicode conversion — delivered by test/identity.test.mjs and the Sift smoke. |
| Identity algorithm, fallback, per-check rule compatibility | M1 / A1–A2 — **accepted v1**: single-pass full-key multiset; content-only matches flagged `contextFallback`; whole-program digest provenance with a comparability guard (D30) | Moved/duplicate/changed-code examples, metadata-only revisions, and real stateless diff integration — delivered by test/identity.test.mjs, test/diff.test.mjs, and the Sift runs. |
| Runtime binding, paths, schema, migrations | M2 | Supported-runtime packaged smoke; recovery and concurrency tests. |
| Command/TUI controls, actor policy, history defaults | M2 | One-off, interactive, agent, headless, and read-only workflows. |
| Decision partitions, semantic conflicts, CI gate behavior | M3 | Two checkouts, clean textual/conflicting semantic merge, local-only override. |
| Score display after review | M3 | Raw, active, reviewed counts remain distinguishable; no dismissal counted as fixed. |
| Retention budgets and scan comparability representation | M4 | Repeated-run disk growth, partial-coverage tests, expired-history behavior. |

The v1 acceptance above is scoped to the stateless diff path: identity is
computed per comparison from one post-scan read per file with findings, never
persisted, and a doctor-program digest change between the two sides refuses
continuity outright. Per-check compatibility revisions and persistent
doctor-supplied evidence remain open for M2, where decisions must survive
across runs.

Performance targets are set at M1 from a measured baseline and representative
workloads, then carried through all milestones. Proposed choices become accepted
only when written back with their evidence; this file is not a hidden mandate to
implement every alternative.
