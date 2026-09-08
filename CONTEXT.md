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

One scan invocation's batch of results, assembled once and rendered by the
report and the dashboard alike: the ReportGroups that ran, the doctor ids
that crashed (data, named), the slugs Confinement skipped, the doctor
id → program path map for re-run commands, and the target's file count and
the batch's wall-clock duration — one defined meaning per field.

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
the check's meta supplies description, severity, impact, why, and fix;
the doctor's meta supplies the defaults when a finding names no check.
A check id is a short kebab-case noun phrase over [a-z0-9-], unique
within its doctor, naming the defect (fetch-calls-without-abortsignal,
filter-table-scan). One doctor program, many checks.

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
source); doctors carry no private copies. Verify always sees everything
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
allowed list.

## Engine

The structural-search backend a DoctorCtx uses to answer ctx.search.
ast-grep is the engine today; oxc is a candidate for TypeScript-heavy
repos. Engine selection is invisible to doctor programs: one doctor
program runs unchanged on any engine. One module owns the invocation
(src/engine.ts); the search host sits on it, and the sdk asks the host —
there is exactly one path, with no unconfined fallback.

## Score

The share of scanned files with no findings, weighted by each affected
file's worst severity (error 1, warning 0.5, info 0.1). One sentence,
locally computed: "491/628 files clean" is a 78. Zero findings is 100 by
anchor; an empty scan is also 100. The denominator is the target's file
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
match — a wrong-check finding at the right line fails the gate.

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
contract must hold for any future sandbox.

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
