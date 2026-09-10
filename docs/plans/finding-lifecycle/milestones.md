# Finding lifecycle: milestones and handoff

Status: planning complete enough to scope the next slice; M1–M4 are unimplemented.
Read [proposal](proposal.md) and [design](design.md) before implementing any slice.
This document is a scope/evidence map, not an instruction to execute all milestones
without a bounded task from the maintainer.

## Starting point

The current source has raw location-based findings, per-check fixture coverage,
JSON output, optional CI gates, and stateless Git-base comparison. It has no
persistent decisions, SQLite layer, or durable finding history. The prior Convex
repair has its own [verification record](../../repair-audit-007.md); its numbers
do not certify future lifecycle behavior or subsequent commits.

Before work, inspect the actual branch, HEAD, dirty state, package version, and
runtime. Preserve existing work. Map the change to the cohort/summary/report/CLI
interfaces before adding the finding-state module. Keep doctor confinement intact.

## M1 — Identity, provenance, and measurable scale

**Deliver:** A1 + A2 in the [analysis improvements plan](../analysis-improvements.md).
Preserve source evidence, settle the anchor source and contract compatibility,
then use versioned finding identity in the existing stateless Git-base comparison.
A standalone library without this consumer does not complete M1.

**Acceptance:** the analysis plan owns the exact matrix for line movement,
duplicate occurrences, relevant edits, custom doctors, Unicode/snapshots, and
incomplete coverage. Keep compareFindings strict for fixture verification.

**Scale proof:** measure identity/comparison records separately from the complete
scanner. Set resource budgets from representative workloads and expose current
limits. If intended workloads exceed them, scope the necessary pipeline work
explicitly; neither a million synthetic records nor SQLite proves scanner capacity.

**Exclude:** persistence UI, team sync, guaranteed cross-file rename matching, and
general module/type/flow analysis. Those broader capabilities do not all block M2/M3.

## M2 — Remember one decision end to end

**Deliver:** local SQLite created lazily on the first saved decision; accepted and
not-applicable decisions with reasons, reversal, and bounded structured retrieval.
Wire the normal report and agent workflow through the same derived decision state.

**Acceptance:** save, restart through an isolated packaged/npx-style installation,
rescan, inspect the reason, reverse, and rescan again. Changed or ambiguous evidence
requires reassessment. Raw findings remain accessible. Test duplicate decisions,
concurrent agent writes, process interruption, schema migration, and corrupt-state
reporting. Reads and scans work without an init step or mandatory persistent writes.

Resolve command/UI names, explicit agent decision authority, local/project scope
selection, automatic history defaults, and the SQLite driver/runtime matrix here.
Replace unconditional fix prompts with investigation and authorized decision paths;
do not let an agent dismiss findings simply to report a clean run.

**Scale proof:** indexed bounded queries over M1 workloads, startup overhead, write
contention, and storage per current finding/decision. A database microbenchmark
does not replace measuring the scan-to-report path.

**Exclude:** cross-machine history service and automatic code edits.

## M3 — Share and reconcile project decisions

**Deliver:** Git-tracked authoritative project records and a reconstructible SQLite
index. Shared CI can apply records in a fresh or read-only checkout. Local decisions
are explicit and do not change shared CI behavior.

**Acceptance:** two checkouts at equivalent source/tool/config/decision inputs apply
identical project decisions with different private histories. Test independent
edits, semantic conflicts that textually merge, decision reversal/deletion, branch
switches, dirty decision files, worktrees, changed detector revisions, and index
rebuild after deletion. A crash between file write and index update recovers from
the authoritative file. Concurrent file updates must preserve independent records.

Resolve partitioning, compatible revision handling, CI suppression semantics,
read-only operation, and score presentation. Display raw/active/reviewed states
without labeling accepted findings as fixed or hiding analysis failures.

**Scale proof:** large decision sets, reconciliation of unchanged versus changed
shared state, merge-review usability, and bounded lookup/output costs.

**Exclude:** database replication, global team accounts, shared developer timelines.

## M4 — Bounded history and comparable rescans

**Deliver:** first/last observations, new/continuing/no-longer-detected/reappeared
views, and claimed-fix records with explicit rescan evidence. Add retention,
storage limits, summaries, and bounded query/export behavior.

**Acceptance:** a comparable complete scan can establish absence; omitted files,
disabled rules, degraded analysis, changed detector meaning, and aborted runs
cannot. Claimed fixes and accepted decisions remain distinct. Branch changes do
not create false resolutions. Expired detail is labeled unavailable. Retention
preserves durable decisions and current state; limits never silently drop live
findings or turn an incomplete scan green.

**Scale proof:** repeated mostly unchanged runs as well as high-churn runs, concurrent
agents, interrupted writes, and long-history queries. Measure end-to-end peak memory,
disk growth and reclamation, query latency, and output/token sizes against M1 budgets.
Avoid full snapshots per run and identify any remaining unbounded report buffers.

**Exclude:** claims that absence proves a bug fixed, hosted analytics, issue tracking.

## Completion evidence for each milestone

- Bound the delivered scope and update open/accepted choices in the design.
- Run meaningful identity, correctness, recovery, and scale checks for that slice.
  Keep author-written tests separate from independent counterexample evidence.
- Review the exact candidate against repository standards and the milestone spec;
  address actionable findings and re-review changed behavior.
- Build and pack the candidate; test the installed artifact on a representative
  repository (Sift is one target, not evidence of massive-codebase capacity).
- Record source/tool revisions, working-tree state, coverage, outcomes, limitations,
  and measured resource budgets. Compare regressions with the prior candidate.
- Update feature availability, glossary terms that actually landed, and HANDOFF.
  Publication and version changes remain the maintainer's separate action.

The recommended next task is A1 + A2 of the [analysis plan](../analysis-improvements.md),
which implements M1. Reliable identity and comparability precede persistence;
broader analysis enhancements remain independent work.
