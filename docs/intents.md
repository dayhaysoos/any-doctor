# Intent-only prompts (experiment input)

The rules in `rules/` must be derivable from these one-liners alone. This
file is written FIRST; rules come after. If a rule needs knowledge not in
its intent, that's a finding for the repair log.

---

1. All LLM calls must go through our gateway in `lib/ai/`. Find direct
   imports of the `openai` or `@anthropic-ai/sdk` packages anywhere outside
   `lib/ai/`.

2. Find `fetch` calls that don't pass an `AbortSignal`.

3. Find `.map(async ...)` calls whose result is not wrapped in `Promise.all`
   — the promises are created but never awaited.

4. Find single-argument `z.record(...)` calls. Zod v4 requires separate key
   and value type arguments (breaking change in the v4 changelog).

5. Find empty `catch` blocks — errors swallowed silently.
