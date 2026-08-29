# The kill test

**The one empirical question:** can an agent generate ast-grep rules good
enough that we'd trust them in CI — from intent-only descriptions, on a real
messy repo?

Everything after this (spec, harness, skill, launch) is gated on the answer.
This is prototype-shaped: throwaway code that answers a question.

## Method

1. Pick a **real, messy repo** (Nick's Effect codebase — actual conventions,
   actual aliasing, actual ugly code).
2. Write **rule intents as one-liners only** (the exact sentences from
   [example-catalog.md](example-catalog.md)). No hand-tuning allowed.
3. Have the agent generate each rule + its fixtures into ast-grep YAML.
4. Run `ast-grep scan` on the repo. **Hand-count** false positives and check
   seeded/known violations for recall.
5. **One repair round** allowed per rule: "this finding is wrong because X"
   → agent revises rule *and* fixtures.
6. Re-count. Record everything.

## The example spread (tier-sampled)

| Intent | Tier |
|---|---|
| Find every remaining import of the old design-system Button | P |
| Find direct imports of `openai`/`anthropic` outside `lib/ai/` | P |
| Find route handlers that touch the DB before calling `requireUser()` | R |
| Find `fetch` calls without an `AbortSignal` | R |
| Find `.map(async ...)` results never wrapped in `Promise.all` | R |
| Only `api/` may import from `db/` | M |

(Adjust to the target repo's real conventions — the point is the tier spread,
not these exact rules.)

## Success criteria

- **Precision ≥ 90%** on the relational rules after one repair round
  (CI-guard tolerance; pattern rules should be higher)
- **Recall ≥ 80%** on seeded/known violations
- Generated rules readable at a glance by a skeptical human in < 2 minutes

## Kill / pivot criteria

- Pattern tier can't express more than half the ruleset → evidence for the
  oxlint semantic tier (D4 trigger), *before* any SDK is built
- Precision lands < 75% even after repair → the premise is shaky; write the
  post-mortem anyway (it's still the launch post)

## Deliverable

The numbers themselves are the launch content:
"Can an agent write correct lint rules? I measured it."
