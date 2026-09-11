# Feature map

Updated September 10, 2026. This replaces the outdated F1–F3 planning text;
historical discovery choices remain in [decisions.md](decisions.md).

## Available in the inspected source

- Local, user-global, and bundled doctor discovery; local wins slug collisions.
- Interactive doctor selection with no default selection, grouped findings, and
  prompts that users can copy to their own agent. Headless runs do not prompt.
- Explicit doctor runs, all-doctor runs, JSON reports, optional CI severity gates,
  and a stateless comparison against a Git base. The diff is identity-aware
  (A1+A2): a finding that moved with its code is **continuing**, a base occurrence
  with no head counterpart is **no longer detected**, and only genuinely added
  occurrences gate — with content-only matches (`contextFallback`), duplicate
  buckets (`ambiguous`), and stale reads surfaced rather than smoothed over.
- Agent authoring instructions, fixture verification, shared counterexamples,
  and optional structural/semantic analysis with declared degraded behavior.
- The Convex repair recorded in [repair-audit-007.md](repair-audit-007.md).

Current findings still carry source locations only — the identity layer derives
its evidence host-side (doctor namespace, normalized line digest, relative
column, enclosing structural context), so no doctor or contract change was
needed. Current run does not persist decisions or history. Generate prepares
the authoring skill and prompt; the user's agent writes the doctor and fixtures.

## Next: finding lifecycle

First deliver [analysis evidence and identity](plans/analysis-improvements.md) in
the existing stateless Git-base comparison. This is lifecycle M1, before saved
decisions. Broader import/type/flow analysis is separate follow-up work.

The [proposal](plans/finding-lifecycle/proposal.md) owns product behavior; the
[design](plans/finding-lifecycle/design.md) owns proposed storage and convergence;
the [milestones](plans/finding-lifecycle/milestones.md) own delivery order and proof.

Planned capabilities:

- Stable finding identity and exact scan provenance.
- Local and project decisions with reasons, reversal, and reassessment.
- Local SQLite state, created lazily; shared decisions as reviewable Git files.
- Consistent decisions across branches, teammates, agents, and CI.
- Finding history, comparable rescans, and honest disappearance/fix reporting.
- Bounded history and report queries for large repositories and concurrent agents.

None of these lifecycle capabilities is implemented by this documentation update.
Command names, storage schemas, and automatic-history defaults remain open.

## Just landed (M2, on `implement/m2-decisions`)

- Remembered local decisions: accepted / not-applicable with a required
  reason, reversible, attached to finding identity (D31) — created from
  the dashboard (a/x + reason prompt, v review view, u undo) or the CLI
  (`decide`, `decisions --reverse`).
- Decided findings leave the active list on later scans; evidence changes
  resurface them with an explicit reassessment warning; raw findings stay
  inspectable and the gate never counts a decision as a fix.
- Investigation-first copy prompts carrying the exact decide command.

## Deferred

Hosted team history, a public doctor registry, mandatory adoption/init workflows,
and issue-tracker features are outside the next lifecycle scope. Custom doctor
authoring and useful contextual suggestions remain core to the product.

## Changes the implementation must account for

The future CLI may write its own state when recording a run or a decision;
doctors retain their read-only analysis contract. Existing read-only scans must
remain possible. The current dashboard's unconditional fix prompts need an
investigation-first lifecycle that also supports an authorized decision.
Host-side diff identity (landed) is the first step toward persistent
per-finding identity for decisions; decisions themselves remain unimplemented.
