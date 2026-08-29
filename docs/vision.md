# Vision

## The problem

Every team has a dozen conventions nobody ever wrote a linter for: things that
keep going wrong, enforced by code review and Slack threads and senior-dev
memory. Hand-writing lint rules is the friction that kills adoption — so the
rules never get written. Meanwhile "just have the LLM read the codebase and
find violations" is non-deterministic, costs inference on every run, and can't
gate a CI pipeline.

## The core inversion

> The LLM manufactures the lint rule. It does not perform every lint judgment.

One expensive model call compiles your sentence into a deterministic analyzer.
After that: same repo + same commit = same findings, forever, at zero
inference cost. This is the same insight React Doctor validated from the other
direction (experts encoding React knowledge up front) — Any Doctor synthesizes
team knowledge on demand.

## The novel axis: lifecycle, not domain

Existing linters assume rules are permanent artifacts written by experts and
shipped in a registry. Any Doctor's actual moves:

1. **Authoring cost → a sentence.** 60 seconds from intent to rule+fixtures.
2. **Rules can be temporary.** Migration audits ("find every remaining import
   of the old design-system Button") are write-one-run-once-delete-it. Nobody
   productizes these today. The batch version — **upgrade doctors** — compiles
   a library's changelog into a set of pre-upgrade detection rules
   (see [example-catalog.md](example-catalog.md)); `tsc` catches mechanical
   breaks *after* you upgrade, but only this can estimate the cost *before*.
3. **Rules encode *your* architecture**, not React's or Effect's — the
   opinionated house rules that could never live in a public plugin.

The domain was never the point. The JS family (TS/JS/JSX/Vue/Svelte) is native
via ast-grep's tree-sitter grammars; Effect was chosen as first dogfood domain
because its idioms are regular and underserved.

## Product shape (v1, agent-native)

The OSS artifact is **not** an AI pipeline. It is:

1. **A rule directory format** — ast-grep YAML rules + fixture files, living
   in the consumer's repo, reviewable in PRs like any other code.
2. **A fixture harness** — built on `ast-grep test` (native snapshot testing);
   every generated rule must ship with positive/negative fixtures.
3. **A skill / instructions file** — teaches *any* agent (Claude Code, Cursor,
   Codex) how to generate rules into that format correctly, including the
   fixture discipline and the repair loop.
4. **A thin CLI wrapper** — `any-doctor scan` / `any-doctor test` around
   `ast-grep scan` / `ast-grep test`, plus a report formatter.

No shipped LLM, no API keys, no server. The user's own agent does generation;
the harness proves it; CI runs it forever.

## Two modes, opposite tolerances

- **Audit scanner** ("find every external HTTP endpoint we call"): recall
  matters; humans triage; false positives are noise.
- **CI guard** (saved rules gating PRs): precision is king; a rule with a few
  percent false-positive rate gets muted within a week.

The funnel is audit → save → CI, and the tolerances flip mid-funnel. Design
for it explicitly.

## Non-goals (v1)

- Scores/dashboards (the "Overall 84/100" cargo-cult — file/line/evidence is
  the product)
- Languages beyond the JS family
- Type-aware or semantic analysis (reserved as a future tier — see decisions)
- A hand-rolled analysis SDK or custom engine
- Free-form generated JS plugins as a v1 artifact (safety + auditability)
