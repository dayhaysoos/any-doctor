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
  experience (experienced first-hand on REPLACED-REPO-NAME: 253 files /
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

## Open questions

- Name: "any-doctor" is a working title.
- v1 surface: pure skill + harness, or skill + CLI from day one?
- Timing of the time-aware primitive (git blame / diff-scoped reporting — the
  trick that makes opinionated rules adoptable despite legacy backlogs, same
  as React Doctor's PR-diff CI mode).
