# CONTEXT.md — domain glossary

Canonical vocabulary for any-doctor. Glossary only — no implementation.
When a term here conflicts with language elsewhere, this file wins.

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
them, it never joins the fold. Skips are a discovery fact, so the
command layer, which owns discovery, patches `skippedUnsafe` onto the
outcome.

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

One emitted finding: a location (file, line) plus optional per-finding
message or severity override. "Issue" and "instance" are retired
synonyms — Finding is the term in code, copy, and prompts. The
doctor-level truth (id, description, default severity, blind spots)
lives in the program's meta, not in individual findings.

## Check

One rule within a doctor program. A finding names its check via `rule`;
the check's meta supplies description, severity, impact, why, and fix —
and, when the check uses the identity engine at full power, its
declaration of that need (`needs`), which is what renders "narrowed"
when the engine is absent; the doctor's meta supplies the defaults when
a finding names no check. A check id is a short kebab-case noun phrase
over [a-z0-9-], unique within its doctor, naming the defect
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
convention, plus read/write). The engine is optional (oxc-parser +
eslint-scope behind the Engine seam's second adapter): checks declare
the analysis they need on their CheckMeta (`needs`), narrow without it,
and the report renders "narrowed" — a degraded run is visible, never
silent. References answer by position, so analysis queries compose with
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
file:line are deduplicated before scoring — the first-sorted copy wins
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
it. Expected findings match exactly on (rule, file, line), duplicates
counted: a missing expected finding is a recall failure; an unexpected
finding is a precision failure. The rule in an expectation is part of the
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
passes.

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
never writes to any scope.

## Skill

The instructions any-doctor provides so an agent can create a doctor that
fits the contract. Planted as `AGENTS.md` behind a one-line provenance
marker; `generate` refreshes a copy it planted (the marker is the
boundary) and never touches a copy without one. The generation prompt
embeds the skill verbatim. Any Doctor equips agents with the skill;
it never launches, deploys, or speaks for an agent.
