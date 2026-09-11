# Vision and direction

Updated September 10, 2026. This is the current product direction. Feature
availability lives in [features.md](features.md); implementation planning lives
in the [finding lifecycle proposal](plans/finding-lifecycle/proposal.md).

## Purpose

Any Doctor helps people and their agents find recurring problems in AI-written
code that ordinary lint configurations do not adequately cover. Users bring
their own agents to create inspectable, deterministic doctors tailored to their
codebases, architecture, and preferences.

Three priorities guide the work:

1. **Find AI slop beyond ordinary linting.** Surface concrete concerns such as
   duplicated logic, unnecessary abstractions, inconsistent project conventions,
   or framework-specific mistakes when a doctor can support the stated claim.
   These are categories to investigate, not promises that every example is
   statically detectable or that every pattern is a defect.
2. **Make the agent's after-coding review useful.** Give agents source evidence,
   clear limitations, structured findings, and a repeatable scan/review/fix/rescan
   loop. Remember intentional choices so later runs can respect them.
3. **Let users author their own doctors with their own agents.** A project-specific
   convention can be valuable without being a universal rule. Keep authoring,
   fixtures, and analysis artifacts local, inspectable, and shareable.

## How the tool earns trust

The agent writes an analyzer; fixtures test its claims; people and agents review
its findings; the same analyzer can be rerun without model inference.

A finding is an observed condition plus an explanation of why it may matter.
It can establish a defect, flag a project-policy violation, or identify a
contextual review candidate. The wording must distinguish those meanings.
Perfect pattern recognition does not prove that changing the pattern is useful.

Contextual suggestions remain part of the product. The goal is useful code
review, not maximizing interruptions, demanding a zero-finding report, or
restricting the entire tool to universally bad code. CI enforcement remains an
explicit project choice.

Trust comes from bounded claims, inspectable evidence, independent evaluation,
visible coverage limits, and remembered decisions. Passing author-written tests
establishes behavior on those cases; it is not a general precision measurement.
Confirmed false positives become regression evidence and trigger rule repair or
narrowing. Dismissals must not replace detector improvements.

Repeatability depends on the same source snapshot, doctor implementation, engine
versions, configuration, and available capabilities. An npm upgrade or a changed
working tree can change results. See [doctor reliability](doctor-reliability.md).

## Finding lifecycle direction

Scanning stays accessible through npx without a required initialization step.
When someone records a decision, the CLI can create state lazily. Doctors stay
focused on analysis; the CLI owns persistence and applies decisions afterward.

Local SQLite storage will support decisions, finding observations, and bounded
history. Git-tracked files will be authoritative for shared project decisions
and configuration. SQLite indexes the checked-out shared state; teams converge
through ordinary Git review and merge, not by merging database files.

The lifecycle distinguishes accepted concerns, non-applicable findings, observed
disappearance, and claimed fixes. Changed code, changed rules, uncertain identity,
or incomplete scans must not silently preserve an invalid dismissal or claim a fix.

Massive codebases and concurrent agents are design inputs from the beginning:
bounded storage, selective queries, limited output, and measured memory behavior
belong in every implementation milestone. A database alone does not establish
scanner scalability.

## Scope and non-goals

Any Doctor is an open-source developer tool. It complements normal linters and
code review. It does not infer that code was AI-written from a finding, replace
product judgment, or certify that an entire codebase is safe.

No hosted service, account, mandatory init, or built-in LLM provider is required
for the planned local lifecycle. Shared cross-machine scan analytics, an issue
tracker, registry expansion, and automatic code modification are separate future
work. They are not prerequisites for remembering a finding.

Language-general structural analysis remains useful alongside JS/TS-specific
semantic facts. A doctor declares its supported languages and capabilities rather
than promising every analysis everywhere.

## What success looks like

- An agent finds a useful concern after coding, explains it accurately, and
  verifies an applicable correction with a comparable rescan.
- An intentional decision survives routine code movement and reaches teammates
  through Git, while uncertain matches request reassessment.
- A user-created doctor enforces the user's stated convention with independent
  positive and negative evidence and honest unsupported cases.
- Large-repository runs expose coverage and resource limits instead of reporting
  partial analysis as a clean result.

The next work is the [finding lifecycle plan](plans/finding-lifecycle/milestones.md).
Its open questions must be resolved in the relevant milestone, not silently
treated as implemented behavior.
