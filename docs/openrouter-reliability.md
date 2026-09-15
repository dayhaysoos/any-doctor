# OpenRouter Doctor migration contracts

Revision 1 used file mentions and text windows. Revision 2 ties advice to actual
request or stream identities. Findings are review inputs, never edit authority.
Detailed baseline, source adjudications, red/green output and package provenance
are retained in `/private/tmp/any-doctor-openrouter-sdk-migration`.

| Check | Minimum definite evidence | Interpretation and unit | Unknown / innocent boundary |
|---|---|---|---|
| missing-abort-signal | Native fetch with bounded OpenRouter URL or supported chat client, actual ordered options/Request, established absent signal | Info cancellation-policy review per request | Unknown endpoint/options/mutation narrow; local functions and other providers are outside |
| hardcoded-dated-model-slug | Concrete version-looking literal in a proven request model field or OpenRouter model factory argument | Info deliberate-pin review per model selection | Computed/external selections narrow; logs, lookup keys, labels and non-OpenRouter models are outside |
| sse-comment-parse-crash | Raw OpenRouter stream, line-framing loop, same line reaches native JSON.parse and no effective preceding exclusion | Warning per parse occurrence | Data-prefix inclusion and colon exclusion guards are innocent; opaque parser flow narrows |
| midstream-error-ignored | OpenRouter chat stream chunk content acceptance without an effective prior same-chunk error exit | Warning per content consumer | Other objects/streams and late checks cannot clear; opaque chunk/handler flow narrows |
| retry-after-ignored | Raw OpenRouter response inside a structural repeated-attempt path without corresponding header consultation | Info retry-policy review per request | SDK-managed retries and unrelated catches are outside; opaque retry/response flow narrows |

Every check needs shared calls analysis and uses `onUnknown: narrow`. Cancellation
also composes the SDK identity/option recipe after endpoint classification. Its
metadata does not select the generic recipe certification profile because that
profile cannot express an endpoint gate. Other checks need custom technology
policy over shared facts; the recipes do not establish HTTP/SSE semantics.

Unknown is distinct from both known absence and known non-OpenRouter identity.
Narrowing is check/file scoped and retains independent definite occurrences.
Provider omission abstains. No project code executes to resolve values.
The shared projection remains serializable and framework-neutral.

## Explicit changes to historical expectations

- Cancellation moves from warning to info: absence is optional-policy advice,
  and cancellation does not universally stop upstream processing or billing.
- The historical SSE seed with a `data:` inclusion guard excludes comments;
  its warning is a false positive, not a sensitivity expectation to preserve.
- The historical model catalog seed never selects a model; an import alone
  does not make it a request. It remains as an innocent seed.
- A free variable called `stream` has no established connection to a nearby
  request. The original midstream seed cannot establish the claimed defect.
- A retry label/catch or header read on an out-of-scope response is insufficient
  to establish retry behavior or handling. Original seeds remain visible.

The migration is performed in ordered green slices. This document records the
intended contracts; completion evidence must establish which are implemented.
