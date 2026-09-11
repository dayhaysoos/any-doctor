# CONTEXT.md — domain glossary

Canonical vocabulary for any-doctor. Glossary only — no implementation.
When a term here conflicts with language elsewhere, this file wins.

Current product intent lives in [docs/vision.md](docs/vision.md). For work on
persistent decisions, history, identity, or team convergence, read the
[lifecycle design](docs/plans/finding-lifecycle/design.md); the first identity
delivery (lifecycle M1, slices A1+A2) is planned in
[analysis improvements](docs/plans/analysis-improvements.md). Their proposed records
are not implemented interfaces; the glossary below describes current behavior
unless a term is explicitly marked planned.

## Doctor program

The artifact an LLM writes: a JavaScript module that inspects a target
codebase through the DoctorCtx and emits findings. One doctor program
encodes one convention the team cares about. Retired synonym: "lint rule."

## Doctor run

One execution of a doctor program against one target directory.
Deterministic for a given engine version: `ctx.search` answers via the host
(the doctor process cannot spawn — it runs under Confinement, and any-doctor
runs ast-grep itself, returning matches over a dedicated channel), so
results can vary across engine upgrades.

## RunOutcome

One scan invocation's batch of results, assembled once by the Cohort and
rendered by the report and the dashboard alike: the ReportGroups that
ran, the doctors that crashed (data — each named, with the full error
detail riding along), the slugs Confinement skipped, the doctor
id → program path map for re-run commands, and the target's file count and
the batch's wall-clock duration — one defined meaning per field. A run also
records whether the identity engine could power it
(`analysisAvailable`) — the data behind "narrowed" rendering.

## Cohort

The module that turns chosen doctor programs plus a target into one
RunOutcome — a single doctor is a cohort of one, so the single-path and
batch commands share one semantics. The command layer chooses the
doctors (a path, the picker, --all) and picks the surface (report or
dashboard); everything from first spawn to last settle lives behind one
call: the runner's bounded pool, the crash fold (a crash is data — id
plus full error detail, never a throw), the process-wide analysis fold,
the per-doctor paths, the file-count policy, and the timing. Progress
events (settle order) are the only side channel — the live line renders
them, it never joins the fold. Skips are a discovery fact, so they ride
in with the CohortSpec: the command layer, which owns discovery, hands
them to the run and the outcome comes back complete.

## Summary

The derived view of a RunOutcome — everything a surface renders,
computed once: the deduplicated severity-ordered groups, the total and
hidden-duplicate counts, the Score and its header lines, the severity
counts and category rollup, each group's check buckets, the narrowed
check ids, and the empty-scan flag. One derivation, N adapters: the
report string, the dashboard tree, and the JSON surface render it —
never re-deriving. Pure —
deriving twice from one RunOutcome yields one Summary; rendering
(colors, prose, trees) belongs to the adapters, never to the
derivation. The facts a gate needs (`--fail-on` severity counts,
baseline-diffable shapes) live here as data, not inside rendering.

## Dashboard

The interactive review surface over a RunOutcome: one module
(src/dashboard.ts) that owns layout, the frame renderer, the TUI loop, and
the per-finding read state — composing the Doctor tree as its view-model
and the Task prompts it copies. Selection, expansion, keymap, and the
clipboard notice live here; the tree's shape and the prompt copy do not.

## Doctor tree

The dashboard's view-model: DoctorGroup → checks → SiteFinding, computed
once from the Summary's per-doctor check buckets (src/doctor-tree.ts —
the tree joins and orders, it never re-groups) and ordered for triage —
worst severity first, then finding count, then name. Every consumer (the
list rows, the detail pane, the task prompts) flattens or reads the one
tree without rebuilding it. A SiteFinding's readKey
(`checkKey@file:line`) is the within-run identity the read state keys on.

## Task prompt

Text the dashboard copies to the clipboard as one unit of agent work: one
finding (fixPrompt), every finding of one check (checkFixPrompt), or a
doctor's whole batch (doctorFixPrompt) — pure functions of Doctor-tree
types plus the verify command, no terminal required. The lifecycle plan
(M2) reworks this family toward investigation-first framing and
authorized decision paths.

## Gate

A run's exit policy — one module (src/gate.ts), one law. Findings are
advisory by default: `--fail-on none` (the default) reports everything
and exits 0, because a scanner that reds CI on first adoption gets
uninstalled. `--fail-on error|warning|info` sets a severity bar ("at or
above") that findings must clear for the run to pass. Crashes and
Confinement skips fail ALWAYS, regardless of the bar — an
infrastructure failure is not a finding and must never paint a run
green. Diff mode (`--base <ref>`) judges only what a change ADDED: the
same cohort scans the merge base of the ref and HEAD (a stateless
baseline — nothing committed, nothing stale), the two deduped finding
sets compare through the identity layer (movement-aware — a finding
that moved with its code is Continuing; `compareFindings` remains the
fixture gate's exact multiset, never the diff's), and the
bar counts added findings only; a change is not blamed for the debt it
was born into. A partial base never gates: any base-scan crash aborts
the run loudly (exit 1, no report, no JSON), because a baseline
missing findings would dress pre-existing debt up as "added" — and a
crashed HEAD doctor skips the diff for the same reason: its findings
are absent, and absence must never read as "no longer detected". Machine
output rides `--format json` — one schema-tagged object on stdout,
diagnostics on stderr.

## Confinement

The layered policy that makes a doctor program safe to execute. A doctor is
a single self-contained file: it may not import anything, and everything
else reaches it through `ctx`. The layers, in order: the static capability
scan refuses named capabilities before execution; the run happens under
Node's permission model (writes, subprocesses, and native addons denied;
worker threads exist only as the import guard's carrier and inherit every
denial); an import guard refuses every module resolution a doctor attempts;
and the network globals are deleted from the process before doctor code
runs. There is no override in any mode.

## Finding

One emitted finding: an observed condition, represented by a location (file, line, optional zero-based column) plus optional per-finding
message or severity override. "Issue" and "instance" are retired
synonyms — Finding is the term in code, copy, and prompts. The
doctor-level truth (id, description, default severity, blind spots)
lives in the program's meta, not in individual findings.

A finding may establish a defect, flag a project convention, or identify a
contextual review candidate. Its existence alone does not establish that a code
change is appropriate. Current locations are not durable lifecycle identities,
but a finding may carry an optional `evidence` range (`endLine`, exclusive
`endColumn`) covering its whole expression: the host validates it against the
scanned source and the identity layer digests the covered span, so edits on
continuation lines still break identity. Findings without a range match on
their flagged line alone — line-scoped, surfaced as such.

## Check

One rule within a doctor program. A finding names its check via `rule`;
the check's meta supplies description, severity, impact, why, and fix —
and, when the check uses the identity engine at full power, its
declaration of that need (`needs`), which is what renders "narrowed"
when the engine is absent; the doctor's meta supplies the defaults when
a finding names no check. A check id is a short kebab-case noun phrase
over [a-z0-9-], unique within its doctor, naming the detected concern
(fetch-calls-without-abortsignal, filter-table-scan). One doctor
program, many checks.

## Doctor contract

The interface shared by doctor programs, the runner, the report, the
fixture harness, and the generator prompt. The single place where the
shape of ctx, meta, findings, and the runner protocol is defined.

## DoctorCtx (ctx)

The capability boundary a doctor program is expected to use: read-only,
repo-scoped file access, structural search, and a finding emitter.
Confinement enforces it: outside ctx there is nothing — no imports, no
writes, no subprocesses, no network.

`ctx.files.list()` and `ctx.search` exclude test paths by default
(test-named code files — `*.test.*`/`*.spec.*` with a code extension —
and `test/`, `tests/`, `__tests__/` directories): tests mimic production
shapes without being production reads. The one law (`isTestPath`) and
the one derivation (`includeTestsFor`) live in contract.ts; every read
capability applies them. A Doctor run opts back in with
`--include-tests`; `ctx.files.read()` is never filtered — an explicit
path is a deliberate choice. `ctx.files.readMasked()` is the one
masking implementation (comments and strings blanked, offsets and
length preserved — a masked position addresses the same char in the
source); doctors carry no private copies — the bundled pack's remaining
copies migrate on the recorded triggers. Verify always sees everything
its fixtures seed: the sandbox is the doctor's own world, and a seed
named `*.test.ts` is deliberate test data.

## Rule query

A composite structural question asked through `ctx.search.rule`: a
pattern to match, optionally constrained by `inside` (the enclosing
construct, scanned to that node's end by default — `stopBy`,
deliberately not ast-grep's own neighbor default). Answers arrive as
Matches carrying end positions and metavariable captures;
multi-metavariables (`$$$NAME`) arrive as arrays of nodes under the bare
NAME, separator commas filtered at the seam. The surface is curated —
pattern + inside — and validated: unknown keys fail loudly with the
allowed list. The plural form (`ctx.search.rules`) asks many named
rules in one engine invocation — every match tagged with its ruleId —
because each call is a process spawn and batching is how a many-shape
check stays fast.

## Analysis query

An identity question asked through `ctx.analysis`: which **Binding** a
name resolves to, and every **Reference** to it. `ctx.analysis.bindings(file)`
returns the file's whole identity model in one answer — every binding
with its declaration span and its references (positions in ctx.search's
convention, plus read/write). `ctx.analysis.spans(file)` (D26) returns
every function-like **Span** — functions, methods, arrows, classes with
name, asyncness, and extent — as an AST fact, replacing the brace-counting
scans doctors once carried privately (the audit truncation bugs lived in
those approximations). The engine is optional (oxc-parser +
eslint-scope behind the Engine seam's second adapter): checks declare
the analysis they need on their CheckMeta (`needs` — vocabulary:
"bindings", "spans", "calls"), narrow without it,
and the report renders "narrowed" — a degraded run is visible, never
silent. `ctx.analysis.calls(file)` provides immediate call use, receiver identity,
inline callback registration, and linked call ranges. These are syntax facts;
stored, passed, or returned is not a promise-settlement verdict. Parse/adapter
errors fail the doctor run explicitly. References answer by position, so analysis queries compose with
rule queries: shapes from one engine, identities from the other.

## Engine

The structural-search backend a DoctorCtx uses to answer ctx.search.
ast-grep is the engine today; the identity engine (ctx.analysis) is its
second adapter — oxc-parser + eslint-scope, optional by design. Engine
selection is invisible to doctor programs: one doctor program runs
unchanged on any engine. One module owns each invocation
(src/engine.ts, src/analysis.ts); the search and analysis hosts sit on
them, and the sdk asks the hosts — there is exactly one path, with no
unconfined fallback.

## Score

The share of scanned files with no findings, weighted by each affected
file's worst severity (error 1, warning 0.5, info 0.1). One sentence,
locally computed: "491/628 files clean" is a 78. Zero findings is 100 by
anchor; an empty scan computes 100 but renders n/a — "Score: n/a — no
files scanned," yellow tone, empty bar, and no clean claim anywhere
(nothing was measured, so nothing is Excellent); the report also carries
the one-copy empty-scan warning naming the extensions and the skips.
The denominator is the target's file
count as the doctors scanned it (default extensions); findings naming
files outside that count can push the raw value negative, so the result
is floored into 0–100 — and floored, never rounded, so any finding costs
at least one point. Findings duplicated across doctors at the same
file:line:column are deduplicated before scoring — the first-sorted copy wins
(groups sort by the first finding carrying an explicit severity
override, else the doctor's declared default; equal-severity groups
fall back to input order) and a hidden duplicate's severity does not
contribute. Each doctor also carries its own score — its findings
against the same denominator — shown on its dashboard row; the
dashboard header carries the selected doctor's score, never a cohort
total (a total mixed doctors into one number that read as whichever row
was on screen). A doctor's score is its own health, not a share of the
repo score (a file's worst finding counts once repo-wide). The report
header keeps the repo-wide score — one number for a run is the job
there. The score summarizes health — the findings are the work; the two
are reported together, never conflated.

## Meta

A doctor program's declared data: id, description, default severity,
optional category, optional checks (one CheckMeta per check), blind
spots. Authored as data, never as comments; read by the report, the
review tree, and the generator prompt.

## Seed

A set of inline files (paths + contents) a fixture materializes into a
temporary directory so a doctor program can be exercised against
known input.

## Fixture

One seed plus the findings expected from running a doctor program against
it. Expected findings match on (rule, file, line, optional column), duplicates
counted: a missing expected finding is a recall failure; an unexpected
finding is a precision failure within these labeled cases, not a population
accuracy measurement. The rule in an expectation is part of the
match — a wrong-check finding at the right line fails the gate. A fixture
also declares its analysis mode (D20 Stage 2): "on" (default) pins the
full-power path and skips with a named notice where the engine is not
installed; "off" forces the degraded path, whose expectations may
legitimately differ.

## Counter-fixture

A fixture authored adversarially after the doctor is green: lookalikes,
same-line variants, and semantic traps, each expectation reasoned from the
intent alone — never from what the doctor currently reports. The generate
workflow's second pass; a doctor ships only after surviving its attack.

## Verify

Running a doctor program against its fixtures and diffing the findings.
The trust gate: a doctor program is not considered working until verify
passes. The policies that compose the gate — the claim contract, the
per-fixture diff, the shared innocent corpus, per-check location
coverage, the shared sensitivity corpus — live in one module, the
Certification harness (`src/certify.ts`), behind one interface:
`certify(mod, fixtures) -> result rows`. The doctor loader calls it once;
prevention tiers land there, not in loader choreography.

## Runner

The process boundary that loads a doctor program, injects ctx, and
returns framed results. Today a local node child process; the same
contract must hold for any future sandbox. A cohort run also exposes a
settle-order progress side channel — one event per doctor as it settles
(out of order under concurrency), carrying programPath, ok, durationMs,
total — consumed by presentation (the live line); the runner never
blocks on it and results stay order-preserved.

## Registry

The record of installed doctor programs per scope. Each doctor's meta is
its registry entry; the doctors/ directory itself is the registry —
discovery reads it directly, with no separate index or cache.

## Scope

Where a doctor program lives: repo-local (`./doctors/`, committed with
the consuming repo), user-global (`~/.any-doctor/doctors/`, available
in every repo), or bundled (the first-party pack inside the package,
read-only — a starting point, not a dependency). Repo-local wins slug
collisions, then user-global, then bundled. Scanning a target repo
currently does not persist state in any scope. Planned CLI-owned state is
separate from doctor discovery and does not grant doctors write capabilities.

## Skill

The instructions any-doctor provides so an agent can create a doctor that
fits the contract. Planted as `AGENTS.md` behind a one-line provenance
marker; `generate` refreshes a copy it planted (the marker is the
boundary) and never touches a copy without one. The generation prompt
embeds the skill verbatim. Any Doctor equips agents with the skill;
it never launches, deploys, or speaks for an agent.

## Location coverage

A certification result for one check's reporting unit. Occurrence-level
warning/error checks need a passing, context-preserving fixture with two
distinct locations of that check in one file. File/project checks need a
positive witness. Unspecified legacy units and unavailable analysis are
reported as not exercised, not counted as passing. Fixture expectations
establish tested coverage, not general correctness or independence of labels.

## Lifecycle vocabulary (planned, except where marked landed)

These terms describe the accepted direction, not current fields on Finding or
DoctorCtx. The [design](docs/plans/finding-lifecycle/design.md) owns their data
and applicability rules.

- **Finding identity** *(landed in the diff path, D30)*: continuity of one
  occurrence across comparable scans, distinct from its current source
  coordinates. Host-derived today — check key, file, normalized flagged-line
  digest, indentation-relative column, and innermost enclosing function span —
  computed per comparison from one post-scan read, never persisted.
- **Observation:** evidence that a finding was detected in a particular scan.
- **Decision** *(landed locally, D31)*: a reasoned accepted/not-applicable
  disposition with a required reason, stored in the local decisions file,
  reversible, attached to a Finding identity — it changes review state
  (the active list), never the raw observation, and never the gate.
  Project scope (Git-shared) is M3.
- **Continuing** *(landed in the diff path)*: a head occurrence matched to a
  compatible base occurrence by identity — movement is not addition. Matches
  resting on content alone are flagged contextFallback; identical copies
  matched by cardinality are flagged ambiguous.
- **No longer detected** *(landed in the diff path)*: absence established by
  compatible, completed coverage.
- **Claimed fix:** a recorded explanation of remediation, separate from rescan evidence.
- **Reassessment** *(landed locally)*: a decision requires review because
  its evidence changed — the finding resurfaces with a warning; the
  decision is never silently carried.
