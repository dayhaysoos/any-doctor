# First-shot yield results

Run: 2026-08-29T23:16:14.497Z · agent: opencode · gate: any-doctor verify

**10/10 passed so far (0 remaining)**

| result | intent | detail |
|---|---|---|
| PASS | Find fetch calls without an AbortSignal |  |
| PASS | Find .map(async ...) results that are never wrapped in Promise.all |  |
| PASS | Find empty catch blocks that swallow errors |  |
| PASS | Find direct imports of the openai or anthropic SDK outside lib/ai |  |
| PASS | Find Date.now used inside Effect.gen blocks |  |
| PASS | Find z.record called with a single argument |  |
| PASS | Find route handlers that touch the database before calling requireUser |  |
| PASS | Find setTimeout calls inside useEffect without a matching clearTimeout |  |
| PASS | Find JSON.parse calls on LLM API responses without schema validation |  |
| PASS | Find API route files that do not import the auth middleware |  |
