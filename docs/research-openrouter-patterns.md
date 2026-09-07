# OpenRouter API patterns — primary-source research
For openrouter-doctor check design. All claims from official OpenRouter docs (fetched 2026-09-06).

## 1. Fundamentals
- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`; body `{model, messages: [{role, content}]}`; response read via `choices[0].message.content`. OpenAI SDK drop-in by setting `baseURL` to `/api/v1`. (https://openrouter.ai/docs/quickstart)
- Attribution headers `HTTP-Referer` and `X-OpenRouter-Title` are optional but canonical in every sample. (https://openrouter.ai/docs/api_reference/authentication)
- Streaming: `stream: true` → SSE `data:` lines terminated by `data: [DONE]`. OpenRouter sends SSE comment keep-alives (`: OPENROUTER PROCESSING`); docs explicitly warn hand parsers must skip lines starting with `:` before `JSON.parse` or the stream loop crashes. Generation id in `X-Generation-Id` response header. (https://openrouter.ai/docs/api_reference/streaming)

## 2. Errors, limits, retries
- Error shape: `{error: {code, message, metadata?}}`; HTTP status mirrors `error.code` for request/key failures; after generation starts, status is 200 and errors arrive in the body or as SSE events. (https://openrouter.ai/docs/api_reference/errors-and-debugging)
- Documented codes: 400 bad params/CORS, 401 invalid key, 402 insufficient credits, 403 forbidden/guardrail block, 408 timeout, 429 rate limited, 502 model/provider down, 503 no provider meets routing requirements. (same URL)
- 429/503 may carry `Retry-After` (seconds); OpenAI/Anthropic/Vercel/OpenRouter SDKs honor it automatically — raw `fetch` must read the header manually. Upstream provider errors are normalized into `error.metadata.error_type`. (same URL)
- Mid-stream errors: after headers commit the status stays 200; error arrives as a SSE `data:` event with a top-level `error` field and `choices[0].finish_reason: "error"`. Docs: it "can be the first and only event" — a 200 with an error chunk and no content is a failure, not a success. (https://openrouter.ai/docs/api_reference/streaming)
- Free `:free` variants: 20 RPM always; 50 req/day if <$10 credits purchased ever, 1000/day if ≥$10. Extra accounts/keys do not raise limits. `GET /api/v1/key` returns `limit_remaining`/`usage`; `X-RateLimit-*` headers on error responses. Negative balance → 402 even for free models. (https://openrouter.ai/docs/api_reference/limits)

## 3. Usage / cost accounting
- Every response carries `usage`: `prompt_tokens`, `completion_tokens`, `total_tokens`, `cost` (USD), `cost_details`, `is_byok`, `*_tokens_details` (e.g. `reasoning_tokens`, `cached_tokens`). (https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)
- Streams always end with a usage chunk just before `[DONE]`. `stream_options.include_usage` is deprecated with "no effect — full usage details are always included", and OpenRouter intentionally deviates from OpenAI: the usage chunk contains one choice with an empty `delta` repeating `finish_reason` (clients treating it as a second terminal event break). (https://openrouter.ai/docs/api_reference/streaming + chat ref above)
- Post-hoc accounting: generation metadata endpoint returns `total_cost` etc. by generation id (https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation); per-key spend via `GET /api/v1/key` (https://openrouter.ai/docs/api_reference/limits). Well-instrumented code reads `usage.cost` per call; code that never touches `usage` silently loses cost data.

## 4. Authentication / key handling
- `Authorization: Bearer <OPENROUTER_API_KEY>`; keys are more powerful than provider keys (credit limits, OAuth). Docs: never commit keys, use env vars; OpenRouter is a GitHub secret-scanning partner and auto-notifies on exposure; exposed keys must be deleted and rotated. (https://openrouter.ai/docs/api_reference/authentication)

## 5. Abort / cancellation
- Streaming requests can be cancelled by aborting the connection (`AbortController.signal` → `AbortError`); for supported providers this stops processing and billing immediately. For non-streaming requests or unsupported providers (Bedrock, Groq, Google, Mistral, Replicate, ...), "the model will continue processing and you will be billed for the complete response". (https://openrouter.ai/docs/api_reference/streaming)

## 6. Model slug hygiene
- Routing variants appended to slugs: `:nitro` (throughput + priority tier), `:floor` (lowest price), `:free`, `:extended`, `:thinking`, `:online`. (https://openrouter.ai/docs/guides/routing/provider-selection; https://openrouter.ai/docs/guides/routing/model-variants/nitro)
- Cross-model failover: pass `models: [primary, fallback...]` (note plural) instead of a lone `model`; provider-object knobs: `order`, `allow_fallbacks` (default true), `require_parameters`, `data_collection`, `sort`, `only`, `ignore`, `max_price`. (https://openrouter.ai/docs/guides/routing/model-fallbacks; https://openrouter.ai/docs/guides/routing/provider-selection)
- Aliases: `~author/family-latest` always resolves to the newest concrete model; response `model` field reports what actually served the request. (https://openrouter.ai/docs/guides/routing/routers/latest-resolution)
- "Model availability is separate from API versioning: models are added and removed by providers independently" — hardcoded dated slugs rot; model endpoints expose `expiration_date` (deprecation) via the models list API. (https://openrouter.ai/docs/api_reference/versioning; https://openrouter.ai/docs/guides/overview/models)

## Doctor check candidates
| Check | Impact | Detectability (literal pattern) | Difficulty |
|---|---|---|---|
| `hardcoded-openrouter-key` | Key leakage; OpenRouter auto-notifies/scans GitHub; full account spend exposure | Literal `sk-or-...` key regex, or `Authorization: \`Bearer ...\`` / `apiKey: '...'` with non-env value at call sites | Easy |
| `sse-comment-parse-crash` | Keep-alive `: OPENROUTER PROCESSING` lines fed to `JSON.parse` crash hand-rolled stream loops | fetch to openrouter + manual `reader`/`split('\n')` loop handling `data: ` but lacking a `startsWith(':')` guard | Medium |
| `midstream-error-ignored` | 200-OK streams containing `error` chunks with zero content are treated as success; silent empty replies | Stream loop reading `choices[0].delta.content` with no `chunk.error` / `finish_reason === 'error'` check | Medium |
| `missing-abort-signal` | User cancels but billing continues for non-streaming/unsupported providers | `fetch(...openrouter..., {stream: true})` (or SDK `.send`) with no `signal:`/AbortController in scope | Medium |
| `usage-chunk-discarded` | Cost/token accounting silently lost; no per-call `usage.cost` instrumentation | Call to `chat/completions` in a file where `.usage`/`.cost` is never referenced | Hard |
| `hardcoded-dated-model-slug` | Dated slugs (`openai/gpt-4o`, `claude-3.5-sonnet`) get removed by providers independently of API versioning | Quoted `vendor/model-version` string literals (regex `['"]([a-z0-9-]+)/([a-z0-9.-]+)-\d)`); Easy to flag, Medium to judge | Easy |
| `single-model-no-fallback` | One provider outage → 502/503 with no automatic failover despite first-class `models: []` support | Object literal with `model:` key but no `models:` sibling (ast-grep) | Medium |
| `retry-after-ignored` | Thundering-herd retries on 429/503; raw fetch must honor `Retry-After` since no SDK backoff applies | Catch/retry loop around openrouter fetch with no `Retry-After` header read | Medium |
