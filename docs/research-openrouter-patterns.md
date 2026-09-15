# OpenRouter claims refreshed September 15, 2026

Primary sources only. These are static analysis contracts, not live billing tests.

- [Streaming](https://openrouter.ai/docs/api_reference/streaming): SSE comments
  begin with a colon. A handwritten parser must exclude them; a positive `data:`
  guard does so. Framing libraries handle comments. Chat completion failures
  after headers can arrive in a top-level error event while HTTP remains 200.
  Cancellation stops upstream work only for supported streaming providers.
  A missing signal therefore supports informational lifetime advice, not a
  billing defect. No fixed provider-support list is embedded in the doctor.
- [Latest resolution](https://openrouter.ai/docs/guides/routing/routers/latest-resolution):
  maintained family aliases select newer models and can change capabilities and
  parameter behavior. Concrete pins are explicitly appropriate for reproducibility.
  Keep version-looking selections at info; do not prescribe an unverified alias
  for every model or confuse routing variants with version aliases.
- [TypeScript SDK](https://openrouter.ai/docs/client-sdks/typescript/overview)
  documents OpenRouter construction and chat.send, including streamed chunks.
  [Request options](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/lib/sdks.ts)
  support flattened RequestInit options and deprecated fetchOptions; direct
  options override nested fetchOptions. Custom HTTP clients/hooks and runtime
  base-URL environment overrides cannot be statically certified.
- [Client configuration](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/lib/config.ts)
  exposes serverURL, server and custom HTTP clients. SDK defaults are recognized
  as declared OpenRouter provenance, not proof of runtime network destination.
- [AI SDK integration](https://openrouter.ai/docs/community/frameworks) establishes
  createOpenRouter and actual provider(model) selection. Merely importing that
  factory or mentioning OpenRouter in a file establishes no model selection.

Earlier prose claiming all SDKs always honor Retry-After and every 429/503 carries
it is withdrawn. Retry calibration must use corresponding response evidence and
current SDK-specific documentation; no universal SDK guarantee is inferred.

[Errors and debugging](https://openrouter.ai/docs/api_reference/errors-and-debugging)
now explicitly says Retry-After may be included and lists the SDKs that respect
it. The [current TypeScript retry implementation](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/lib/retries.ts)
reads the corresponding response header when configured for backoff, accepting
seconds and HTTP dates. This supports excluding SDK-managed retries; it does not
prove every installed version/custom wrapper has an enabled retry policy.
