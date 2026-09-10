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

The current CLI has location-based findings, JSON reports, interactive selection,
optional gates, and Git-base diffing. It has no persistent decision store, SQLite
integration, or finding history. This pass changes documentation and authoring
instructions only; it does not implement lifecycle commands or alter the runtime.
Existing runtime taglines and unconditional fix prompts are not a substitute for
this direction; reconcile relevant copy when implementing the agent workflow.

## Next bounded scope

Implement lifecycle M1 through A1 + A2 in the
[analysis plan](plans/analysis-improvements.md): source evidence and anchors,
explicit contract/compatibility choices, and movement-aware identity comparison
in the existing stateless Git-base workflow. Preserve exact fixture matching in
compareFindings; introduce separate scan comparison semantics. This gives the
analysis work a real consumer before persistence exists.

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
