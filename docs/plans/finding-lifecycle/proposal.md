# Finding lifecycle: product proposal

Status: direction agreed in the September 10, 2026 planning conversation;
implementation has not started. Exact command names and defaults are proposals.
Read [vision](../../vision.md) for purpose, [design](design.md) for mechanisms,
and [milestones](milestones.md) for scope and acceptance evidence.

## Outcome

People and their own agents can find concerns after writing code, investigate
them, record intentional decisions, and verify changes without repeatedly
re-litigating the same code. Teammates can share those decisions through Git.

Contextual review candidates remain useful. A user may decide that duplicated
helpers should stay independent, or may create a doctor enforcing a team-specific
convention. A finding's evidence and explanation must support that evaluation;
the tool does not require every finding to be a universally proven defect.

## Workflows

### Scan and investigate

Run a selected doctor through npx without required initialization. A finding shows
the observed condition, location/evidence, explanation, supported scope, and any
applicable past decision. Agents receive structured equivalents and can retrieve
bounded batches. No state is required to perform a one-off read-only scan.

### Record a decision

A user chooses **Not applicable** when the finding's interpretation is wrong for
this code, or **Accepted** when the concern applies but the implementation is
intentional. Both require a reason and explicit local/project scope. A decision
can be reversed. Its matching scope stays limited to the reviewed finding unless
the user explicitly chooses a broader project policy.

The first saved decision creates state automatically; a separate init command is
not a prerequisite. Applicable decisions hide findings from the normal active
list, while a review view exposes them and their reasons. Raw findings and
analysis failures remain inspectable. Proposed active, reviewed, and raw counts
must distinguish these states; exact score and CI integration is open in design.

### Fix and rescan

An agent investigates a finding, changes code when appropriate, and reruns the
relevant doctor. A comparable successful scan can establish **No longer detected**.
A person or agent can separately record a claimed fix, explanation, and optional
commit. A claimed fix remains unverified until supported by an applicable rescan;
even that rescan proves the detector's condition disappeared, not universal safety.

Excluded files, disabled rules, missing engines, changed detector meaning, and
failed or incomplete scans must not masquerade as fixes. An unchanged finding is
continuing; a confidently matched finding that returns may be labeled reappeared.

### Share with a team

Project decisions are Git-tracked and reviewed alongside code. A pull or branch
switch makes the checked-out records authoritative on the next reconciliation.
CI applies those records without needing a developer's SQLite file. Conflicting
decisions stay visible until resolved; timestamp ordering does not settle intent.

Local decisions stay private to the checkout and are labeled as such. They never
silently change shared CI outcomes. Full developer scan histories are not committed
or synchronized as part of the initial feature.

### Work with user-owned agents

An agent can inspect evidence, prior decisions, coverage, and compatible previous
runs through machine output. Agent authority to accept/dismiss findings must be
explicit in the task or project policy; producing a clean report is not authority.
Agents can propose decisions when they lack that authority. Attribution records
who or what supplied a decision, without presenting a supplied name as verified
identity. No built-in model, inference call, or automatic source edit is required.

## Success scenarios

| Scenario | Required outcome |
| --- | --- |
| Blank lines inserted above accepted code | Decision follows a confidently identified occurrence. |
| Two identical helpers in different modules | One decision does not hide the other finding. |
| Relevant code or rule semantics change | Incompatible decisions become pending reassessment. |
| Fresh clone, same source and compatible tools | Same project decisions apply as in an existing clone. |
| Branch switch removes a project decision | The old branch's cached decision stops applying. |
| Scan fails halfway through | Coverage is incomplete; unexamined findings are not resolved. |
| Accepted finding still appears in raw results | Review state changes; it is not counted as a fix. |
| Large finding set | Agent output is bounded; totals and remaining pages are discoverable. |

## Initial exclusions

Hosted history synchronization, an issue tracker, automatic fixes, autonomous
agent dismissals without delegated authority, and whole-program proof of correctness
are outside this feature. Mandatory init and registry expansion are not dependencies.
Cross-file rename matching can start conservatively; uncertain continuity must
remain visible rather than being guessed.

## Open product choices

- Whether ordinary interactive runs save history automatically; headless and CI
  defaults, read-only behavior, and explicit persistence controls.
- Exact CLI verbs, TUI actions, local/project selection, and agent policy format.
- How reviewed decisions affect optional CI gates and the existing score display.
- Default history retention and storage budgets, informed by scale measurements.

Resolve each choice in its milestone and write the result into the design and
decision log. The current documentation task does not implement those choices.
