# Vision

## The problem

Every team has a dozen conventions nobody ever wrote a linter for: things
that keep going wrong, enforced by code review and Slack threads and
senior-dev memory. Hand-writing lint rules is the friction that kills
adoption — so the rules never get written. Meanwhile "just have the LLM
read the codebase and find violations" is non-deterministic, costs
inference on every run, and can't gate a CI pipeline.

## The core inversion

> The LLM writes the analyzer. Fixtures prove it. CI reruns it forever.

One LLM invocation compiles your one-sentence convention into a doctor
program — real code written against our typed `ctx` SDK (the pattern
Cloudflare calls Code Mode; we run it entirely locally, no vendor). After
that: same repo + same commit = same findings, forever, at zero inference
cost.

## The experience

```bash
any-doctor generate "find fetch calls without an AbortSignal"
any-doctor run .        # report, then walk the findings interactively
any-doctor verify --all # the trust gate, for every doctor you own
```

The bar is React Doctor's CLI: fast scan line, grouped findings with
file:line evidence, severity glyphs, declared blind spots, and a
hand-off point where the findings feed your LLM to fix. The analyzer
itself is generated on demand and scoped to exactly what you asked about.

## The novel axis: lifecycle, not domain

Existing linters assume rules are permanent artifacts written by experts
and shipped in a registry. Any Doctor's moves:

1. **Authoring cost → a sentence.** From intent to fixture-gated doctor
   in one agent session.
2. **Rules can be temporary.** Migration audits ("find every remaining
   import of the old design-system Button") are write-one-run-once-delete.
   Upgrade doctors compile a library changelog into pre-upgrade detection
   rules — `tsc` catches mechanical breaks *after* you upgrade; this
   estimates the cost *before*.
3. **Doctors encode *your* architecture**, not a framework's — the
   opinionated house rules that could never live in a public plugin.

The JS family (TS/JS/JSX/Vue/Svelte) is the native range; Effect was the
first dogfood domain because its idioms are regular and underserved.

## Trust model

- Every doctor ships fixtures (seeded files + exact-set expected findings).
  `verify` is the gate: missing expected findings fail recall, unexpected
  findings fail precision.
- Generated programs declare blind spots as data; reports print them.
- The CLI independently re-verifies anything an agent produces — an
  agent's output is never trusted on its own word.
- Doctors are boring files in your repo: auditable, diffable, reviewable
  in PRs. The runner seam (today a node child process) is where a
  technical sandbox plugs in when doctors become third-party.

## Two modes, opposite tolerances

- **Audit scanner** ("find every external HTTP endpoint we call"): recall
  matters; humans triage.
- **CI guard** (saved doctors gating PRs): precision is king — a rule with
  a few percent false-positive rate gets muted within a week.

The funnel is audit → save → CI, and the tolerances flip mid-funnel.

## Non-goals (v0)

- Scores/dashboards until precision justifies them — file/line/evidence
  is the product; a number bolted on top invites cargo-culting.
- Languages beyond the JS family.
- Hand-rolled parser/engine internals — engines live behind `ctx` as
  replaceable primitives (ast-grep today, oxc-backed semantics later).
- Cloudflare or any hosted component. The Code Mode pattern, fully local.
