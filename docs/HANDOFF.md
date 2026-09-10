# Handoff — finding lifecycle planning

Updated September 10, 2026. Start here when continuing Any Doctor's product direction
or implementing decisions, history, identity, or team sharing.

## Read in order

1. [Vision](vision.md): the maintainer's three priorities and the trust model.
2. [Feature map](features.md): available behavior versus planned work.
3. [Lifecycle proposal](plans/finding-lifecycle/proposal.md): user and agent workflows.
4. [Lifecycle design](plans/finding-lifecycle/design.md): ownership, storage,
   identity, Git reconciliation, scale, and unresolved choices.
5. [Milestones](plans/finding-lifecycle/milestones.md): bounded delivery and evidence.
6. [Analysis improvements](plans/analysis-improvements.md): the concrete M1
   implementation scope, anchor/contract choices, and strict acceptance matrix.

D29 in [decisions.md](decisions.md) records this direction. Current terms remain in
[CONTEXT.md](../CONTEXT.md); planned lifecycle terms are explicitly marked there.

## Current state

This documentation pass began on a clean checkout at source HEAD 4adf69c. The
package declared version 0.0.7. Recheck branch, HEAD, dirty state, runtime, and
publication status before implementation; these are inspection facts, not a
permanent baseline or proof of what npm currently serves.

The prior Convex/certification repair is now part of the inspected source, followed
by additional review commits. Its [audit](repair-audit-007.md) records the exact
older candidate tested, including 286 tests and 100 Convex verification rows.
Those results must not be presented as a fresh test of later source or this plan.

**Delivered on `implement/analysis-a1-a2` (A1+A2, D30):** the `--base` diff now
compares through the host-derived identity layer — added / continuing /
no-longer-detected with contextFallback, ambiguous, stale, unreadable, and
contextUnavailable surfaced in report, JSON, and gate paths. `compareFindings`
stays the strict fixture gate. Evidence: 316 tests green (28 new identity/diff
cases mapping the acceptance matrix — the matrix rows were authored in the plan
before implementation, and the review-loop counterexamples supplemented them as
the independent labels) plus a packed-artifact smoke on sift-skills (Apple M1
Pro, 16 GB, Node 26.5.0; 632 files, 5 doctors: single scan 8.1s / 82.4KB JSON;
`--base HEAD~5` double scan 7.2s / 82.9KB JSON, 402 continuing / 1 added, the
added finding cross-checked against git as a gitignored working-tree artifact).
Synthetic identity benchmark (all-unmatched worst case): 10k ≈ 60ms, 100k ≈
0.5s, 1M ≈ 5s, ~1.1GB heap — a layer limit, not scanner capacity; end-to-end
pipeline peak memory at that scale remains unmeasured. Documented v1 deferrals
(D30): primary-expression evidence ranges (line digest only — continuation-line
edits do not currently invalidate), receiver/declaration linkage beyond the
innermost span, independently addressable same-line occurrences without
doctor-supplied columns, and before/after pair display (M4). The CLI still has
no persistent decision store, SQLite layer, or finding history.

## Next bounded scope

M2 — remember one decision end to end — is next, per the
[milestones](plans/finding-lifecycle/milestones.md). The identity layer's v1
choices are recorded in D30 and the [design](plans/finding-lifecycle/design.md)
open-choice table; per-check compatibility revisions and doctor-supplied
evidence are still open there because nothing persists yet.

Broader module resolution, value flow, control flow, and optional types are later
independently scoped capabilities. They do not all block M2/M3. Measure the real
scanner separately from synthetic identity records; report current limits and
assign scanner-scale work explicitly before claiming massive-codebase capacity.

M2 adds local decisions; M3 adds Git convergence; M4 adds bounded history. These are
planning increments, not authorization to run all four or publish a version.
Resolve open choices in their milestone and write accepted decisions back to the
design and decision log. Maintain one-off read-only scans and doctor confinement.

## Product constraints to preserve

Useful contextual findings and user-defined conventions remain in scope. The goal
is better review with the user's own agent, not forcing every report to zero.
Accepted concerns, not-applicable findings, observed disappearance, and claimed
fixes must remain distinct. A dismissal does not authorize broad detector changes.

SQLite is local state; committed project files are authoritative for team decisions.
Private decisions cannot silently change CI. Git branch changes and semantic merge
conflicts must be tested, including cache rebuild from shared records. No mandatory
hosted service, account, init, or built-in model provider is required.

## Validation for the next agent

Use the milestone's acceptance cases and independent counterexamples. Review the
actual candidate, pack/install it, and exercise a real target such as Sift without
changing unrelated product code. Sift alone does not validate massive-codebase
performance; retain the scale harness results and limits too. Update this handoff
with the delivered slice, exact evidence, and remaining open choices. The maintainer
owns versioning and publication unless a later instruction explicitly changes that.
