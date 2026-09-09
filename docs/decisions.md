# Decision log

Append-only. Each entry: context → decision → consequences. New sessions
should read this file first and *not* relitigate closed decisions.

---

## D1 — Open source tool, not a startup

**Date:** 2026-08-28

**Context:** Idea emerged from studying React Doctor. Explicitly not pursuing
as a venture.

**Decision:** Build as an OSS project. Optimize for usefulness, trust, and a
compelling demo — not defensibility. Crowded space is validation, not threat.

**Consequences:** No moat engineering. Prioritize boring stable artifacts over
platform ambitions. The launch content (measured precision/recall) doubles as
marketing.

---

## D2 — Agent-native architecture: harness + skill, no shipped LLM

**Date:** 2026-08-28

**Context:** A standalone CLI calling an LLM API means key management, cost,
model churn, and we'd be maintaining an AI pipeline nights-and-weekends. The
alternative: the user's own agent does generation.

**Decision:** The OSS artifact is a rule format + fixture harness + skill file
(+ thin CLI). Agents (Claude Code, Cursor, Codex) generate rules into the
format. CI runs saved rules with zero inference.

**Consequences:** Small stable core to maintain. Generation quality depends on
the user's agent, which keeps improving for free. v1 could literally be a
skill + harness. Downside: generation UX varies by agent; acceptable for OSS.

---

## D3 — ast-grep as v1 executor; YAML artifacts

**Date:** 2026-08-28

**Context:** Chosen over building on oxc/oxlint. Three sub-decisions were
conflated and separated: (1) artifact format the LLM emits, (2) analysis power
needed, (3) API stability.

**Decision:** Generated rules are **ast-grep YAML** (declarative: pattern +
constraints + relational ops), with `ast-grep test` snapshot fixtures. JS
visitors are an escape hatch, not the default.

**Rationale:** Constrained artifacts generate more reliably (fewer degrees of
freedom = fewer ways to be subtly wrong); auditable at a glance in a PR;
data-can't-execute (a generated YAML file can't phone home — a generated JS
plugin is a small supply-chain incident in a stranger's repo); native test
harness gives us the fixture story free; stable format for years vs oxlint's
fast-moving JS plugin API; multi-language headroom via tree-sitter.

**Accepted ceiling:** no scope/symbol/import resolution → `const run =
Effect.runPromise; run(...)` defeats patterns. Rules document this (see D7).

---

## D4 — oxlint/oxc reserved as future *semantic tier*; no abstraction now

**Date:** 2026-08-28

**Context:** React Doctor's architecture (shared `core`, both eslint-plugin
and oxlint-plugin adapters) proves the multi-executor endgame. oxc semantic
analysis (scope, symbols, CFG, type-aware via tsgolint) covers ast-grep's
ceiling.

**Decision:** Do not build an executor abstraction, an oxlint tier, or an SDK
now. A future rule manifest may declare `executor: ast-grep | oxlint` with a
shared fixture format — but only when evidence demands it.

**Evidence that triggers D4:** the kill test's false-negative log shows alias
/import-sensitivity causing systematic misses on real conventions.

**Explicitly rejected:** hand-rolling a custom engine on oxc internals
(React Doctor's path — funded team, full-time, months).

---

## D5 — Fixtures ship with every rule; the fixtures ARE the product

**Date:** 2026-08-28

**Context:** The hard failure mode of LLM-generated rules is not bad code —
it's *good code for a neighboring spec* ("inside an Effect workflow" is
ambiguous between two human experts).

**Decision:** Every rule must ship with positive + negative fixtures
executable by `ast-grep test`. The authoring loop is: generate → run against
real code → model adjudicates candidate findings → disagreements crystallize
into fixtures → CI runs the pure rule.

**Consequences:** Model-level precision at authoring time; determinism and
zero inference in CI. The fixtures make saved rules maintainable and give the
repair loop grounding.

---

## D6 — Evidence-first sequencing; Wayfinder deferred

**Date:** 2026-08-28

**Context:** Toolbox includes Matt Pocock skills (wayfinder, to-spec,
prototype). Wayfinder is for work too big for one session, wrapped in fog.

**Decision:** Run the [kill test](kill-test.md) first (prototype-shaped:
throwaway code answering a question). Only then `to-spec` into a real spec.
Wayfinder earns its place later if scope grows (language #2, semantic tier) —
the fog will exist then.

---

## D7 — Rule honesty: declared analysis level and blind spots

**Date:** 2026-08-28

**Context:** Trust in generated rules requires knowing what they *can't* see.

**Decision:** Every rule carries metadata declaring its analysis level —
`syntactic` (pattern), `relational` (within-file structure), `multi-file`
(import/path-aware) — and known blind spots ("syntactic rule; may miss
aliased imports"). Reported alongside findings.

---

## D8 — CLI generation delegates to the user's installed agent (adapter pattern)

**Date:** 2026-08-28

**Context:** The desired UX is "an LLM produces rules on the fly" via a CLI.
Cloudflare Code Mode was raised again as the substrate. The pattern (an LLM
writes executable analysis) is the product's core; Cloudflare's *product* is
not required for it.

**Decision:** `any-doctor generate "<intent>"` builds a prompt from the
generation skill and delegates to whatever agent the user already has:
`claude -p`, `codex exec`, `opencode run`, or a custom command via
`--agent` / `ANY_DOCTOR_AGENT` (with `{prompt}` placeholder support). No
first-party LLM integration, no API keys, no server. After the agent returns,
the CLI **independently verifies** with `sg test` — an agent's rule is not
trusted until the deterministic harness passes it.

**Consequences:** Keyless OSS that rides the agent ecosystem; generation
quality improves with the user's agent for free. Generation UX varies by
agent. The first-shot-yield measurement (the product's core metric) requires
a working agent install at runtime.

---

## D9 — Code Mode pattern is the core; the artifact is a generated program, not YAML; the CLI report is the product (supersedes D3, amends D2/D8)

**Date:** 2026-08-28

**Context:** Nick corrected course after running react-doctor on a real repo.
The product vision: `any-doctor "<what to check>"` → the user's LLM produces
a static-analysis program (via the Code Mode *pattern*: LLM writes TypeScript
against our typed SDK — **no Cloudflare dependency**) → the CLI runs it and
renders a React-Doctor-class report (score header, category rollup,
rule-grouped findings with file:line evidence) → findings feed the LLM to
fix. The YAML rules I built optimized for auditability and lost the thread:
they were lint config, not generated analysis programs.

**Decision:**
- The generated artifact is a **`doctor(ctx)` TypeScript program** against a
  typed SDK (`ctx`: files, parse/query, symbols/imports, report builder).
  Code Mode the pattern; local execution; vendor-free.
- The **CLI report is a first-class deliverable**, matching the React Doctor
  experience (experienced first-hand on a real production repo: 253 files /
  104ms, score, categories, grouped evidence).
- BYO-agent generation (D8) unchanged. Deterministic reruns unchanged: the
  saved program re-executes with zero inference.
- YAML rules are demoted out of the product surface. The five prototype rules
  become reference intents/specs; ast-grep may remain an internal engine
  primitive behind `ctx`, never the user-facing artifact.
- Trust layer carries over: fixtures gate generated programs; the
  REPAIR-LOG lessons move into the program-generation prompt.

**Consequences:** Bigger build (SDK + isolate/subprocess sandbox + report
renderer). The falsifiable next milestone: one intent → generated program →
report on a real repo, measured against a known ground truth.

---

## D10 — YAML-era surfaces deleted, not frozen

**Date:** 2026-08-28

**Context:** The architecture review (2026-08-28) found the repo's front doors
still sold the superseded YAML direction. The grilling loop for the doctor
contract offered freeze vs delete vs rewrite; Nick rejected freezing: "we're
way too early to be locking in decisions like this — we don't need to keep
the messy stuff."

**Decision:** Deleted outright: the `generate`/`init`/`test`/`scan`/`list`
CLI commands, the YAML generation skill, the prototype rule pack (rules,
fixtures, snapshots, sgconfig), and the fake-agent dev script. Knowledge
salvaged to `docs/` (RESULTS.md, REPAIR-LOG.md, intents.md); the seeded
sample-app moved to `fixtures/sample-app`. D8's agent-adapter code is
deleted with it; generation returns (rewritten for doctor programs) once
the program-generation skill exists.

**Consequences:** The CLI is exactly two commands — `run` and `verify` —
matching what the codebase actually is. Nothing in the repo contradicts the
decision log. Regeneration of anything deleted is cheap: the decisions log
plus docs/ hold the rationale, and the kill-test learnings live in
REPAIR-LOG.md.

---

## D11 — Architecture review round 2: the contract becomes enforcement

**Date:** 2026-08-28

**Context:** Second cold audit found the pivot's promises had gaps: no
author-facing types (Q3 unimplemented), spoofable sentinel frame, verify
losing all results on one crash, seed path traversal, false-green sg parse
failures, and a repo with zero commits and no .gitignore.

**Decision:** Adopted the review's top recommendation. Implemented:
declarations + `types` entry shipped (doctor authors can now reference
real types); meta validated against the severity enum; sync `doctor()`
rejected with a clear message; unparseable sg output is a loud error,
never an empty finding set; last-sentinel-wins frame parsing; doctor
stdout forwarded to stderr; per-fixture fault isolation (a crashing
fixture is a named failing result, siblings still report); seed paths
rejected unless contained in the verify sandbox. Repo: `.gitignore`
added, real `npm install` replaces the borrowed-tsc/symlink build,
build script cross-platform, docs shipped in the tarball, `npm test`
builds first (pretest). CONTEXT.md corrected where it promised more
than the code does (isolation is by convention today; fixtures match
(file, line); determinism is per engine version). The initial commit is
deliberately left to Nick.

---

## D12 — Generation returns: skill for doctor programs, agent adapter restored

**Date:** 2026-08-29

**Context:** D10 deleted the YAML-era generation flow. Nick clarified the
deletion intent (the YAML files specifically) and greenlit restoring what
the doctor-program experience needs.

**Decision:** Restored, rewritten for the program contract: the generation
skill (`skill/any-doctor.skill.md` — contract, workflow, fixture discipline,
honesty rules, and the failure lessons from REPAIR-LOG), the
`any-doctor generate "<intent>"` command (agent adapter: claude/codex/
opencode, custom via `--agent`/`ANY_DOCTOR_AGENT`; the CLI independently
re-runs `verify` as the post-generation gate), and `dev/fake-agent.sh` for
plumbing tests without a real agent. The YAML-era fixtures and rule pack
remain retired — their role is played by `.fixtures.mjs` files.

**Consequences:** The full loop works: intent → agent writes doctor + fixtures
→ verify gate → scan. What is still unmeasured: first-shot yield with a real
agent (requires a working agent install; plumbing proven via fake agent).
D8's adapter design is hereby re-instantiated in src/cli.ts.

---

## D13 — Doctor discovery & registry UX (planned; spec in docs/features.md)

**Date:** 2026-08-29

**Context:** Nick's desired experience: `any-doctor verify` / `run` without
a doctor argument should offer a fuzzy-searchable picker; doctors created
by generate should be automatically saved in their own non-interfering
directory. Not previously documented anywhere.

**Decision:** Adopted as the next feature set after generation. The build
spec lives in `docs/features.md` (F1 no-arg fuzzy selection, F2
repo-local + user-global registry with auto-save and a non-interference
rule, F3 related batch commands). Implementation follows that file;
deviations update it in the same commit.

---

## D14 — Any Doctor equips agents; it never deploys them

**Date:** 2026-08-29 (amended 2026-09-03)

**Context:** The run menu shipped a "Hand off to an agent" item that spawned
the user's agent, and `generate` spawned the agent headlessly. Nick
corrected the model: React Doctor's actual pattern is copy-the-findings;
Any Doctor's only relationship to agents is *equipping* them — the skill
and the contract — so they can create doctors that fit the interface.

**Decision:** No Any Doctor product command ever launches an agent process.
- The run menu's handoff is now **"Copy findings for your agent"** — a
  ready-to-paste fix prompt on the clipboard (pbcopy/wl-copy/clip).
- `generate` is **prompt-only**: it plants the skill as `AGENTS.md` in the
  scope dir (agents load it natively), copies the exact generation prompt
  (skill + intent + verify command), and tells the user to run `verify`
  afterward. No spawning, no API keys, no adapter — works with any agent,
  including GUI agents that have no CLI.
- `dev/first-shot.mjs` remains the sole spawner: it is a measurement tool,
  not product.
- Deleted: `src/agents.ts`, the agent adapter, and registration-on-generate
  (discovery scans directories; the index is an optional cache).

**Consequences:** `generate` is instant and free. Generation quality now
depends on the skill + the user's agent in the user's own session, which is
exactly the surface we maintain. The first-shot measurement runs in the
user's environment by design.

---

## D15 — The npx experience: findings first, creation separate

**Date:** 2026-09-05

**Context:** React Doctor's traction lesson: `npx react-doctor@latest` gives
findings in under a minute — no install, no account, no key. Any Doctor's
cold start inverted that: author doctors first, run later. Nick rethought
the onboarding with two constraints: no intent routing and no AI-orchestrated
creation ("weird territory"), and creation must not live inside the running
experience.

**Decision:**
- `npx any-doctor` with no arguments **runs** instead of printing usage:
  bundled doctors are discovered, the picker appears, findings follow.
  (`help` still prints usage.)
- **Bundled scope:** a small, curated first-party doctor pack ships inside
  the package. Read-only, lowest priority — repo-local wins collisions,
  then user-global, then bundled. No network at run time.
- **`init` means adoption, not creation:** copies the bundled pack into
  `./doctors/` (skipping existing files) so a team can edit, prune, and
  commit it. Bundled is a starting point, not a dependency.
- **`create "<intent>"`** is the creation path — today's prompt-only
  `generate`, renamed to plainer English; `generate` remains as a hidden
  alias. D14's posture is unchanged: no spawning, no keys, the user pastes
  the prompt into their own agent.
- **Explicitly rejected:** intent routing (matching free-text intents to
  doctors) and any in-CLI agent orchestration or model integration.

**Consequences:** The run experience stays pure — select a doctor, see
findings; nothing pitches AI at a user who hasn't bought in yet. Creation is
advertised only where curiosity peaks: one dim next-steps line after an
interactive session, a mention in `init`'s output, and the usage text.
`run`/`verify` never touch a model (unchanged). Build order: bundled scope →
no-args-runs → `init` + `create` rename.

**Amendment (2026-09-05, post-D16):** Lived experience corrected the flow:
with the check tree, the dashboard is itself the selection surface, and a
doctor picker in front of it is friction — the worst doctor lands one enter
deep instead of on screen. Bare `run` (and the future no-arg npx entry) now
aggregates every discovered doctor straight into the tree dashboard, no
picker: doctor rows (worst-severity-first, counts, collapsible) → check
rows → instances. The picker remains only for `verify`, where choosing one
doctor to gate is the actual job.

**Amendment (2026-09-08):** The pack outgrew the no-picker flow — nine
bundled doctors (and growing) overwhelmed the cold start more than a
menu would have. Bare interactive runs now open a cohort selector
first, and selection is opt-in: nothing is pre-selected, so narrowing
to one doctor is one space instead of nine deselects. Space toggles the
row under the cursor, `a` toggles every row the filter shows (the
run-everything gesture), an empty selection refuses to run (notice,
stays), and esc cancels before anything executes. --all,
ANY_DOCTOR_HEADLESS, and non-TTY never see a prompt; the tree
dashboard remains what follows.

**Amendment (2026-09-07):** The bundled scope landed. The pack resolves
from the package's own `doctors/` (a sibling of `bin/` wherever the
package is installed — repo dev, node_modules, or the npx cache), joins
discovery after user-global, and dedupes when it IS the repo dir
(running inside this repo). Bare `npx any-doctor` with no arguments now
runs (build-order item 2): every discovered doctor, straight to the
report/tree; `help` remains the usage door. Remaining from the build
order: `init` + the `create` rename.

---

## D16 — The doctor experience: category doctors and the check tree

**Date:** 2026-09-05

**Context:** Nick's product direction: a doctor should own a whole
category a team cares about ("the async doctor"), not one narrow pattern.
Opening it shows the *types* of issues as first-class things to select;
drilling into a type shows where it bites. The contract already allowed
this (DoctorMeta.checks, finding.rule, the Check glossary term) — the
pilots just never used it, and the dashboard had no check-level
navigation.

**Decision:**
- **Flagship:** `doctors/async-doctor.mjs` consolidates fetch-without-
  AbortSignal, unawaited async map, and uncleared setTimeout-in-effect
  as three checks with merged fixtures (15/15 green). The three
  single-pattern originals are deleted.
- **Dashboard tree:** multi-check doctors render doctor → check →
  instance. Check rows show glyph, description, and instance count;
  enter (or →) expands, ← collapses; enter on an instance copies its
  scoped context as before. Check rows carry a check-level detail pane
  (why/impact/fix/blast radius). Single-check doctors render exactly as
  before — no tree, no behavior change.
- **Severity-first, after React Doctor's research:** checks sort errors
  before warnings before info (count descending within a band); error
  checks are expanded on entry ("errors always show"); warning/info
  checks start collapsed. An expanded check shows its first 50 instances
  plus a "… and N more — fix a few and re-scan" affordance — the re-scan
  loop is the pagination, not in-session paging.
- **Keys:** the feed decodes →/← as their own keys alongside ↑/↓.

**Consequences:** The picker lists categories, not fragments; one spawn
covers a whole concern. The dashboard triages: highest severity on
screen at entry, categories summarized, instances one enter away.

---

## D17 — Confinement: layered runtime enforcement, not a sandbox claim

**Date:** 2026-09-05

**Context:** Doctors are agent-authored programs executed against a repo.
The realistic threat is sloppy or prompt-injected code, not a targeted
attacker; the proportionate answer had to add no OS-level machinery
(containers, seatbelt profiles — explicitly rejected as over-engineering).

**Decision:** Four probe-gated layers, no override in any mode. (1) A
static capability scan refuses named capabilities before execution —
tripwire for slop, honest label: it sees the doctor file only. (2) The
doctor process runs under Node's permission model (writes, subprocesses,
and native addons denied — worker threads exist only as the import guard's
carrier and inherit every denial; reads open; verify writes to the temp
dir only). `--allow-worker` exists solely for the import guard's hook
thread — denials verified to propagate into worker threads (fs write and
subprocess are denied inside them). Node prints a SecurityWarning for the
flag on
every run; it is suppressed (`--disable-warning=SecurityWarning`) because
the verified behavior is recorded here instead — the banner would alarm
every run while changing nothing. (3) An import guard
(module resolve hook) refuses every module a doctor tries to reach:
builtins, helper files, npm packages, static, dynamic, or computed — a
doctor is a single self-contained file (the guard itself stays a
standalone hand-maintained file in bin/, the one exception to the tsc
build: a resolve hook may not import anything). (4) The network globals (fetch,
WebSocket) are deleted from the process; with imports vetoed there is no
socket API left. `ctx.search` answers over a dedicated channel: the host
runs ast-grep, the doctor asks. Amends D4: the Engine seam earned a
module when it had two call sites; the sdk's legacy direct fallback was
later deleted (a channel-less ctx.search fails loudly instead of running
ast-grep unconfined), leaving the host as Engine's one caller — the module
stays for locality: it is where a future backend slots in alone.

**Consequences:** Old runtimes degrade to fewer layers (probe-gated, never
to zero — the static scan is unconditional). Network on future runtimes
gains a real deny flag eventually; the global strip covers today's.
Residual honesty: process.env is readable (no outbound channel exists),
DoS is bounded by the loader timeout, the search root check is lexical (a
symlink inside the target pointing out is followed — accepted under the
slop-not-adversary model), and no layered scheme rules out
engine-internals exotica — the issue #3 tripwire (escalate if third-party
doctor distribution ships) stays armed.

---

## D18 — Tests are not production reads: run excludes them by default

**Date:** 2026-09-07

**Context:** The first real-world scan (a production Convex app, ~970
files) returned 1008 findings, the majority from test files — mocked
`ctx.db` calls in fixture arrays, `Date.now()` in seeded documents,
`.collect()` in test helpers. Tests mimic production shapes without being
production reads; scanning them floods findings and buries real signal
(a first-run wall of a thousand findings is an uninstall). One doctor's
fixtures cannot see this class: it is a property of what a run means.

**Decision:** The exclusion lives in the platform, not in doctors:
`ctx.files.list()` drops `*.test.*`, `*.spec.*`, and `test/`, `tests/`,
`__tests__/` directories by default (sdk walk, one law, every doctor).
A run opts back in with `--include-tests` (Mode carries it; argv
`<root> --include-tests`). `ctx.files.read()` is never filtered — an
explicit path is a doctor's deliberate choice. Verify always lists
everything its fixtures seed: the sandbox is the doctor's own world, and
a seed named `*.test.ts` is deliberate test data (effect-doctor's
sleep-in-test check depends on it). Fixture-named test files therefore
remain testable, and test-focused checks run under `--include-tests`.

**Consequences:** Doctors get quieter and more honest on real repos
without changing a single check; findings counts drop to production
reads only. A doctor that wants to inspect tests must ask the user to
pass `--include-tests` (documented in blindSpots where relevant —
effect-doctor's sleep-in-test says so). Files under directories merely
named like tests (`spec/`, `__mocks__/`) are not excluded; the pattern
is deliberately conservative. Story files (`*.stories.tsx`) are not
tests and stay included.

**Amended 2026-09-07:** the law now reaches every read capability. The
convention lives in contract.ts as one predicate (`isTestPath`) with one
derivation (`includeTestsFor`: run → flag, verify → everything), and the
search host filters matches under the same law — as first shipped, only
ctx.files.list excluded, leaving ctx.search flooding test-file findings
on a default run. Prose narrowed to "test-named code files" to match the
enforced pattern exactly (a `notes.test.md` still lists for doctors that
scan .md).

---

## D19 — The score is the share of clean files, not a subtraction

**Date:** 2026-09-07

**Context:** The first real-world scan surfaced it: 664 warnings on a
628-file repo scored 0/100 — "Critical" — while 491 of those 628 files
(78%) had zero findings. Linear severity subtraction (100 − 10·errors −
4·warnings − 1·info) floors on any large codebase and conflates "much
bad code" with "mostly good code with concentrated problems." React
Doctor's score stays high with findings present (98/100 in their docs
example) because it
is density-normalized — though theirs is computed by a closed server
API, which contradicts any-doctor's no-cloud posture and would make the
number unexplainable.

**Decision:** score = 100 × (1 − burden/filesScanned), where each file's
burden is set by its worst finding: error 1, warning 0.5, info 0.1.
Locally computed, deterministic, explainable in one sentence a user can
verify by counting files. Zero findings anchor at 100; an empty scan is
also 100. Renderers pair the score with the raw counts ("491/628 files
clean") so health and work are never conflated. The same change
recalibrated convex-doctor against real-codebase feedback: the clock
check now flags only measuring/branching uses (stored timestamps are
safe per Convex semantics and were 259 of the 664 findings), unbounded
subscriptions demoted to info (the call site cannot see the query's
bounds), and take/first/unique-terminated index chains are exempt
(the terminator bounds the read).

**Amendment (2026-09-07, dashboard):** The dashboard header no longer
shows the cohort score — with several doctors on screen it read as
belonging to whichever row was selected. The header now carries the
selected doctor's own score (bar and clean-files line scoped to it);
every doctor row keeps its compact score, and the detail pane dropped
its copy. The repo-wide score remains the report/CI surface, where one
number for a run is the job.

**Consequences:** A single noisy check can no longer zero a score — it
costs only the files it touches, which points pressure at doctor
calibration instead of punishing the repo. Small repos are twitchier
(one warning in two files costs 25 points) — honest density semantics.
Severity weighting is a named constant (FILE_BURDEN), tunable when
field data argues. A remote metrics/score API (doctors run, findings
resolved over time, opt-in telemetry) stays parked — see Open
questions.

---

## D20 — The analysis ladder: factory first, engine second, migration last

**Date:** 2026-09-08

**Context:** An external review of 8c3ba52 (confirmed against source)
found: compareFindings keys on file:line only — a wrong-rule finding at
the right line passes, and duplicate findings collapse (the gate is
rule-blind for multi-check doctors); three real precision bugs in
async-doctor (same-line Promise.all consumption invisible because the
consumer scan starts after the declaration LINE, not point; `await
jobsArray` wrongly counts as consuming the array's promises; a bare
discarded `items.map(async ...)` without a const assignment is never
seen); the headless run exits 0 with findings (no CI gate); and the
score rises when clean files are added (accepted — density metric,
D19's never-conflate rule covers it). The three async bugs are bug
CLASSES, not instances: wrong region anchor, wrong semantic assumption,
over-narrow trigger — every authored doctor will re-make them, and the
single-file law replicates the primitives that carry them.

A key decomposition: the async class needs no type inference or
dataflow. `const jobs = X.map(async ...)` proves array-of-promises at
the declaration syntactically; what regex cannot do is collect the
REFERENCE SET of that binding and check each reference's shape. So the
SDK surface that fixes the class is: node-context queries + binding
references. Regex keeps its legitimate home: filenames, naming
conventions, text inside identified literals.

**Decision — three stages, platform before migration:**
- **Stage 0 (factory, no new engine):** fix the three async-doctor bugs
  each pinned by new fixtures; compareFindings becomes rule-aware and
  multiset (`rule:file:line`, duplicates detected) with the fixture
  migration that follows; generate gains an adversarial counter-fixture
  step — a second pass attacks the doctor with lookalikes, same-line
  variants, and semantic traps before it ships (breaking the
  shared-blind-spot problem of self-graded fixtures).
- **Stage 1 (ast-grep expansion, no new deps):** expose structured
  queries and enclosing-node context through ctx.search (killing the
  brace-counting class with the engine we already ship), and
  ctx.files.readMasked() (killing the masking-drift class).
- **Stage 2 (the oxc adapter behind the Engine seam):** binding and
  reference queries as ctx.analysis.*, host-side like the search host
  (Confinement intact). oxc is an optional engine — same posture as sg
  on PATH — with honest capability degradation: checks declare the
  analysis they need, narrow without it, and say so in blindSpots.
  Sequencing is deliberate: migrating bundled checks before the
  primitives exist buys nothing; the bundled doctors migrate as the
  SDK operations' first customers and become the reference examples
  the skill teaches from. Stage 2 also unblocks slop-doctor: dead-export
  and write-only-field are relational checks grep can only approximate.

Also queued from the same review: the CI gate chapter (failure
thresholds like --fail-on error, --format json, baseline/diff-scoped
reporting) — already this log's oldest open question, independently
reconfirmed as the top adoption lever.

**Consequences:** Generated doctors stop being responsible for parsing
code with regex; they compose reliable analysis operations. Checks
whose promised behavior exceeds the available engine narrow honestly
instead of approximating silently. The bundled pack's text-based span
tracking is temporary scaffolding — expected to migrate, not to grow.

**Amendment (2026-09-08): Stage 1 shipped as primitives + pilots.**
`ctx.search.rule` (pattern + inside; `inside.stopBy` defaults to `end` —
deliberately diverged from ast-grep's neighbor default, per the repair
log's stopBy lessons), Matches enriched with end positions and
metavariable captures (multi-captures as bare-name arrays, ast-grep's
separator commas filtered at the seam), the host payload extended in
place with an op discriminator (no protocol bump — runner and loader
ship atomically), and ast-grep invoked by its current name with an sg
fallback. `ctx.files.readMasked()` is the one masking implementation —
offsets preserved as an interface guarantee. Two checks migrated as the
pilots: the async fetch check (the `$$$ARGS` capture replaced its
argument brace-counting) and async-doctor's masking reads (its private
maskNonCode copy deleted; the other three doctors' copies remain until
the bulk trigger). The bundled pack's bulk migration is deliberately
deferred, with named triggers: the next D20-class bug found in the old
string-surgery layer, or Stage 2's start (it needs the proving ground)
— zero users make churning four working doctors unjustified until then.
Agent guardrails shipped with the surface: query validation with typo
suggestions, verbatim engine errors echoing the query, too-old engine
detection, and the skill's rule-query section teaching the stopBy
default, the capture-array shape, and the positive-fixture requirement.

**Amendment (2026-09-08, later): Stage 2 shipped — the identity engine,
analysis as data.** The engine facts first: oxc's semantic layer is not
exposed to JavaScript (their issue #22985), so the adapter is
oxc-parser (fast TS parse, an optionalDependency — install failure never
kills any-doctor) plus eslint-scope (scope/reference resolution, a
regular dependency), behind one swappable module (src/analysis.ts); if
oxc ships JS semantics someday, the adapter's implementation swaps and
nothing above it moves. The language posture is decided, not implied:
analysis is per-language adapters with TypeScript/JavaScript first —
the same seam accepts a second language later without doctor changes.
`ctx.analysis.bindings(file)` answers once per file (host-side model
cache keyed by mtime+size) with every binding's declaration span and
references in ctx.search's position convention — shapes compose with
identities by position, which the pilot proves. The op family gained its
third member; decoding moved to contract.ts where unknown ops fail
loudly instead of silently becoming pattern searches. Degradation is
data: CheckMeta.needs declares what a check wants, the runner records
capabilities on every run, and the report renders "narrowed" — including
for zero-finding checks, where a narrowed clean must never read as a
full-power clean. Availability is honest data (ctx.analysis.available,
no-host answers false for narrowing decisions while bindings() fails
loudly like ctx.search), and verify pins both paths: fixtures carry
`analysis: "on"` (honest skip where the engine isn't installed) or
`"off"` (forces the degraded path — expectations may legitimately
differ). The pilot is unawaited-async-map's identity path: per-element
consumption, same-name bindings in other scopes, and never-reassigned
let targets are now checked (the degraded path keeps its declared blind
spots, pinned by "off" fixtures); 40 fixtures cover both paths.

**Amendment (2026-09-08, latest): one invocation per doctor.** The
pilot's first shape — nine separate rule queries — measured 2.2× slower
than main on a 300-file repo: every ctx.search call spawns the engine,
and a spawn costs ~85ms wall regardless of repo size (process start
dominates; scanning 300 files is 6ms of CPU). The identity engine was
innocent (35ms to resolve all files). The fix is a fourth channel op
that was implicit all along: `ctx.search.rules` — many named rules in
ONE ast-grep invocation (inline rules separated by `---`, matches
returning tagged with their rule's id). The pilot now asks all ten of
its questions in one spawn and measures within ~100ms of main; the
skill teaches the rule (many questions → one batch) beside the op.

---

## Open questions

- Opt-in metrics/score API (parked, D19): count doctors run and findings
  resolved over time the way React Doctor's score API does — valuable for
  the registry era, wrong before `npx any-doctor run` finds bundled
  doctors out of the box. Must stay opt-in; the local score stays the
  source of truth either way.
- Name: "any-doctor" is a working title.
- v1 surface: pure skill + harness, or skill + CLI from day one?
- Timing of the time-aware primitive (git blame / diff-scoped reporting — the
  trick that makes opinionated rules adoptable despite legacy backlogs, same
  as React Doctor's PR-diff CI mode).
