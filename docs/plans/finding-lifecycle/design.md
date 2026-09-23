# Finding lifecycle: design

Status: partially implemented. Identity-aware comparison (M1) and remembered
local decisions (M2) shipped; Git-shared decisions (M3) and bounded history (M4)
remain planned. [Proposal](proposal.md) owns user behavior. D30 and D31 in the
[decision log](../../decisions.md) own accepted M1/M2 choices.

## Ownership

Doctors emit raw findings through their existing confined, read-only contract.
The CLI owns identity, observations, decisions, reconciliation, and persistence
in a finding-state module. A doctor must not receive filesystem write or database
capabilities merely because the CLI gains persistence.

Keep raw scan evidence separate from review state. The command layer composes the
finding-state module with the cohort and presentation flow. Human output and JSON
consume one derived review state; optional gates deliberately continue to judge
raw findings. Local decisions can be recorded, reversed and queried today. Scan
observations and history remain an M4 concern.

## Data model and authority

These are CLI-owned lifecycle records, not additions to DoctorCtx. The status
column distinguishes shipped state from the remaining design.

| Record | Status | Meaning and minimum provenance |
| --- | --- | --- |
| Scan | Planned M4 | Run ID, source snapshot, target/scope, config digest, doctor/engine revisions, per-check coverage and completion. |
| Finding identity | Shipped M1 | Versioned occurrence identity separate from the latest line/column, with evidence scope and provenance. |
| Observation | Planned M4 | A finding detected in a particular scan, its evidence digest and current location. |
| Decision | Local shipped M2; project planned M3 | Finding identity, accepted/not-applicable disposition, reason, scope, applicability evidence, revision and supplied attribution. |
| Claimed fix | Planned M4 | Explanation and optional commit/source reference; a claim distinct from the next scan observation. |

Observation state, review disposition, and claimed remediation are separate axes.
An accepted finding may still be detected. "No longer detected" requires a
comparable completed scan; it is never inferred from a decision alone.

M2 stores local decisions in a versioned atomic JSON file at
`.any-doctor/decisions.local.json`, created only on the first decision. A corrupt
file fails loudly; scans never reset it. Cross-process read-modify-write locking
is a documented residual limitation.

M3 will add Git-tracked project decisions as the authority for shared intent.
Their exact filenames and partitioning remain open, and a fresh/read-only checkout
must be able to apply them without a preexisting database. M4 may add an indexed
local store for observations and history once measured volume and query needs
justify it. Database or cache files remain local and disposable only when no
durable decision exists solely inside them.

## Finding identity

The [analysis plan](../analysis-improvements.md) records the M1 delivery:
host-derived anchors, optional host-validated Finding evidence ranges, snapshot
and coordinate integrity, compatibility policy and integration into stateless
diff. Scan comparison remains separate from strict fixture matching.

The shipped identity combines doctor/check namespace, file, relevant source
digest, relative column and enclosing structural context. Decision applicability
also checks doctor provenance (declared check revision or program digest). Legacy
line-scoped findings remain visibly conservative; stale evidence is not decidable.

Identity continuity and applicability are distinct: moving a function may preserve
identity while changing its body invalidates a prior decision. Identical text in
two places is not one finding. Line shifts should not destroy identity, while an
ambiguous duplicate match must not carry a suppression. A whole-file hash alone
invalidates decisions on unrelated edits; a snippet hash alone conflates copies.

Custom doctors and unavailable semantic context use conservative fallback.
Unavailable anchors mean uncertain continuity or visible reassessment. Rule
meaning can change without its public ID changing, so M2 records implementation
provenance and defaults to reassessment on unknown compatibility.

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

## Doctor identity across authors and renames (planned, M3)

Decisions crossing trust boundaries — committed project records shared
through Git — need doctor identity that is unique across authors and
stable across display renames. Two mechanisms, both visible, both
authored; no hidden self-asserted IDs:

- **Namespace/id.** A doctor's full key is `namespace/id` when it
  declares a `namespace` (kebab-case author or origin), bare `id`
  otherwise. Bundled doctors stay bare forever — the curated first-party
  pack — so the 0.1.2 rename never churns again; third-party doctors
  MUST declare a namespace, making `alice/convex` and `bob/convex`
  distinct by construction while keys stay human-readable (surfaces may
  show the friendly id; machine surfaces carry the full key). A copy
  that keeps the same namespace/id is honestly the same doctor; a fork
  that changes meaning diverges through provenance (revision/digest).
  Self-generated UUIDs are ruled out: they travel with file copies,
  producing invisible collisions — worse than name collisions because
  nobody can read the key. The doctor identity key never drops its
  namespace component: matching decisions on code evidence alone would
  let one doctor's decision suppress another doctor's finding at the
  same location — the cross-doctor suppression the identity layer
  exists to prevent.
- **`supersedes` for renames.** Renaming is a semantic event only the
  doctor's owner can assert: `supersedes: "convex-doctor"` (old full
  key). On load, the state layer migrates decisions from superseded
  keys to the new ones, gated on provenance continuity — revision or
  program digest must still match; a rename combined with a meaning
  change resurfaces decisions for reassessment rather than silently
  carrying. This is the explicit, authored version of "identity
  survives renames": no invisible magic, and the migration is visible
  in state.

Both are proposals to resolve in M3, when they become load-bearing. If accepted,
the doctor contract, authoring skill and machine surfaces must land together;
current `0.2.0` doctors do not declare these fields. The 0.1.1→0.1.2 bundled
rename churns once, deliberately; `supersedes` is not retrofitted for it.

## Team convergence

For the same source, compatible doctors/engines, configuration, and committed
decisions, a fresh checkout and a warm checkout must apply the same project
decisions regardless of their private histories.

On run/query startup, apply the exact checked-out project records. Any optional
local index must replace removed/changed records as well as add new ones; a blind
union resurrects decisions from other branches. A shared-state digest may avoid
redundant imports but cannot become the authority.

Use deterministic serialization and stable record IDs. Git combines independent
changes; Any Doctor validates duplicate or incompatible decisions even when Git
reports a textual merge as clean. Conflicts fail closed for suppression and are
reported visibly. Timestamp or author name is not a winner-selection algorithm.
Malformed shared records must not silently yield an apparently successful review.

A project decision is durable only after its authoritative file update succeeds.
Any local index can then be updated or rebuilt. Writes need atomic replacement and
conflict detection so concurrent agents cannot overwrite unrelated decisions.
Recovery must replay the authoritative files after interruption. Current local
decisions use atomic JSON replacement, not SQLite transactions.

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
- Version schemas. Validate shared records and migrate local state safely. Test
  interrupted migration and corrupt-state reporting. Never silently reset state
  containing the only copy of local decisions.
- A future database does not bound the current cohort/report memory. Measure the
  entire pipeline and identify where streaming, spooling, or bounded materialization
  is needed before claiming large-codebase support.

If M4 selects SQLite, keep each database on local storage rather than using a
shared network filesystem as team sync. Validate the binding against the package's
supported Node/platform matrix and an isolated npx installation; choosing a
database does not authorize silently raising the Node minimum.

## Decisions still required

| Choice | Resolve by | Required evidence |
| --- | --- | --- |
| Host-derived versus doctor-supplied anchors; optional Finding evidence contract | M1 / A1 — **accepted v1**: host-derived identity plus optional host-validated Finding evidence range (D30 amendment) | Legacy doctors, validated ranges, same-snapshot joins, Unicode and multiline conversion. |
| Identity algorithm, fallback, per-check rule compatibility | M1 / A1–A2 — **accepted v1**: single-pass full-key multiset; content-only matches flagged `contextFallback`; whole-program digest provenance with a comparability guard (D30) | Moved/duplicate/changed-code examples, metadata-only revisions, and real stateless diff integration — delivered by test/identity.test.mjs, test/diff.test.mjs, and the Sift runs. |
| Runtime binding, paths, schema, migrations | M2 — **accepted**: versioned atomic local JSON; database deferred to M4 (D31) | Packaged restart workflow, corruption refusal and sequential merge behavior. |
| Command/TUI controls and actor policy | M2 — **accepted**: dashboard `a/x/v/u`, CLI `decide`/`decisions`; command runner supplies authority (D31) | One-off, interactive, agent, headless and read-only workflows. |
| Decision partitions, semantic conflicts, CI gate behavior | M3 | Two checkouts, clean textual/conflicting semantic merge, local-only override. |
| Score display after review | M3 | Raw, active, reviewed counts remain distinguishable; no dismissal counted as fixed. |
| Retention budgets and scan comparability representation | M4 | Repeated-run disk growth, partial-coverage tests, expired-history behavior. |

M1 identity powers both stateless diff comparison and M2 decision keys. M2 stores
per-check revision or program-digest provenance and resurfaces incompatible
decisions. Project identity across authors and renames remains open for M3.

Performance targets are set at M1 from a measured baseline and representative
workloads, then carried through all milestones. Proposed choices become accepted
only when written back with their evidence; this file is not a hidden mandate to
implement every alternative.
