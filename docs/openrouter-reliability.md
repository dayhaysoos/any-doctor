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

## Verified boundary

Revision 2 uses explicit unknown values separate from absent properties and
proven local lookalikes. Ordered properties, stable lexical aliases and bounded
stream transformations share the same expression facts. Object escapes include
contained aliases; graph searches visit finite states rather than assignment paths.

The independent review regressions cover nested and unresolved SDK stream flags,
SSE prefix offsets and sliced payloads, invalid SDK signals, conditional transport
identity, opaque object/client transfers, cycles and repeated assignment graphs.
The durable independent runner is `node dev/openrouter/challenge.mjs <candidate>`;
`node dev/openrouter/scaling.mjs <candidate>` checks growing independent sites.
Both accept an installed package directory and invoke its explicit CLI and doctor.

The frozen Sift comparison changes 57 historical reports to 15 informational
review candidates (nine request lifetime, six actual model pins). The false SSE
warning parsed a completed `stream: false` response. Nine conditional/external
pin selections become scoped uncertainty; five client handles passed to opaque
helpers also abstain on cancellation advice; three exported policy pins and 16 UI
choices require cross-file flow and are outside this local check. The 23 original
false positives are removed. Six legitimate pins move from declarations to their
actual selection calls. Unknown paths retain definite neighboring findings and
make score/grade null. Detailed row-by-row source adjudication stays outside Git.

Known limits remain: runtime client hooks/environment overrides and installed SDK
behavior are not proved; arbitrary cross-function stream transformations narrow;
SDK signal factories other than established AbortController signals can narrow;
retry analysis recognizes structural response-dependent loops, not execution counts
or actual waiting. Unknown raw endpoints may narrow even when a human can establish
a non-OpenRouter destination from external configuration. Mutation facts are
conservative across the whole lexical binding lifetime. Default file exclusions,
including `.mts`, `.cts`, `.cjs`, remain separate coverage limits.

The final verification report in the evidence directory records the exact commit,
package hash, local/installed counts, review resolutions and frozen manifests.
A green suite establishes this bounded contract, not universal absence of bugs.
