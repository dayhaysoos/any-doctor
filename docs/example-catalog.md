# Example catalog

Brainstormed rule intents showing the breadth of "anything JavaScript
related." Each is written as the literal sentence you'd type. Tier tags:

- `[P]` syntactic — pure pattern match
- `[R]` relational — within-file structure (`inside`/`has`/`precedes`)
- `[M]` multi-file — import paths / file graph / repo awareness
- `[S]` semantic — needs scope/types (future oxlint tier, D4)

The rule intents are raw material for the kill test, the demo, and the
launch README GIF. The pitch is **one tool, one sentence each, unrelated
frameworks**.

## Async correctness

Emptier than people assume — most of this has zero linter coverage.

- Find `.map(async ...)` results that are never wrapped in `Promise.all` `[R]`
- Find `fetch` calls without an `AbortSignal` `[R]` — orphaned requests
- Find `setTimeout` in effects without a matching `clearTimeout` `[R]`
- Find `addEventListener` in effects with no `removeEventListener` in
  cleanup `[R]` — paired-symmetry rules
- Find `await` inside `for` loops `[R]` — exists (`no-await-in-loop`) but
  rarely enabled; the sentence version that suggests `Promise.all` sells
- ⚠️ Floating promises generally is type-aware territory — typescript-eslint
  owns it; don't lead with it

## AI-era conventions

Emptiest field, highest 2026 demand.

- Find direct imports of `openai` / `anthropic` outside `lib/ai/` `[P]` —
  gateway enforcement
- Find LLM responses that get `JSON.parse`'d without schema validation `[R]`
- Find prompt template literals interpolating raw user input `[R]` —
  prompt-injection hygiene; no linter has this category yet
- Find `catch` blocks that swallow errors / `catch { return null }` `[P]` —
  framed as "find where the agent hallucinated a swallow"

## Auth / data-layer ordering

The screenshot-able demo category.

- Find route handlers that touch the DB before calling `requireUser()` `[R]`
  — an *ordering* constraint; `precedes`/`follows` territory
- Find Prisma queries using the bare `db` client instead of the `tx`
  transaction handle `[R]`
- Only `api/` may import from `db/` `[M]` — architecture-as-one-sentence

## Temporary migration rules

The sleeper hit — write one, run the audit, delete it. Nobody productizes
these.

- Find every remaining import of the old design-system Button `[P]`
- Find code still reading the deprecated `config.legacyFlags` key `[P]`
- Find API routes not yet on the new middleware chain `[R]`
- Find remaining `moment` imports (we migrated to date-fns) `[P]`

## Upgrade doctors (changelog → rules)

The batch version of the above: point any-doctor at a library's changelog /
migration guide **while still on the old version**, and it compiles the
breaking changes into a set of temporary rules — an upgrade *cost estimate*
("340 call sites affected, grouped by breaking change").

Key mechanics and caveats (2026-08-28 discussion):

- **The compiler overlap:** post-upgrade, `tsc` already catches removed
  exports / renamed APIs / signature mismatches for free in TS repos. Our
  differentiated positions: (a) *pre-upgrade* scanning — the compiler can't
  see v2's rules while you're on v1; (b) semantic changes invisible to
  types; (c) JS repos.
- **Migration guides are before/after pairs** — the "before" snippets are
  should-flag fixtures, the "after" snippets are should-not-flag fixtures.
  The fixture discipline (D5) is sourced nearly free from the input doc.
- **Changelog quality is the variable.** Each breaking change gets
  classified: pattern-expressible / relational / needs-types / not-statically-
  checkable — and the report states what was verified vs. what couldn't be
  (D7 honesty). "Error messages changed" → "can't check statically," never
  silently dropped.

Worked examples: Express 4→5 (`app.del`, `'*'` → `'*splat'`) `[P]`;
React 18→19 (`defaultProps` on function components, string refs,
`propTypes`) `[P]`; Zod 3→4 (`z.record` now requires two args) `[P]`.

## House style (the Dylan Mulroy category)

Opinionated rules that could never live in a public plugin — they'd be noise
for everyone else.

- Never import across layers via relative `../..` — use `@/` aliases `[M]`
- Never construct SQL by string concatenation `[P]`
- Never pass `Date` objects across the API boundary — ISO strings only `[R]`
- Server actions must call `requireUser()` before data access `[R]`

## Inventory / audit mode

The scanner, not the guard — recall matters, humans triage.

- List every external HTTP endpoint we call — gateway-building inventory
- List every route handler and whether it has auth `[R]`
- List every place we bypass the logger `[R]`

## Future harness primitive: time-aware rules

Add a `git blame` / diff primitive and these become possible:

- Flag `as any` and non-null assertions added *after* the AI-pilot rollout
- Report only violations introduced by this PR (React Doctor's CI trick —
  the adoption unlock for opinionated rules despite legacy backlogs)

See [decisions.md](decisions.md) open questions for timing.

## Effect-specific starters (dogfood domain)

- Find `Effect.runPromise` calls inside Effect workflows `[S]` — honest tag:
  needs the semantic tier to avoid false positives on the legitimate
  program-boundary call; a syntactic version will document that blind spot
- Find `Date.now()` inside Effect code — suggest `Clock` `[R]`
- Find raw promise construction wrapping Effect operations `[R]`
