# Deepgram doctor authoring trial

Date: 2026-09-21

Candidate: branch `feature/openrouter-doctor-sdk-migration`, baseline HEAD `b19b9b911e77c0a613813f2d3567ed71c08d76af`

Verdict: **acceptable after independent review and real-project repairs**

## Authoring path

The trial began from the public CLI surface rather than an existing doctor:

1. `node bin/cli.js help agents`
2. `node bin/cli.js capabilities --format json`
3. `node bin/cli.js generate "Create a bundled Deepgram doctor ..." --stdout`
4. Read the generated `/Users/nickdejesus/Code/any-doctor/doctors/AGENTS.md`, `skill/author-workflow.md`, the custom-check and capability-gap sections of `docs/doctor-sdk.md`, and `docs/research/deepgram-doctor.md`.
5. Rechecked the pinned official Deepgram skills at `deepgram/skills@c56c10b` and `deepgram/deepgram-js-sdk@3bb661b`, plus current Deepgram reference pages.
6. Created the starting pair with `node bin/cli.js scaffold deepgram` and replaced every scaffold marker.

The scaffold made the two-file contract and incomplete-state gate obvious. The capability catalog clearly separated reusable identity, value-flow, ordered-property, and narrowing facts from product policy. It also prevented a private parser: raw calls are selected through call identity or the shared value graph, SDK provenance comes from import targets, and unsupported local flow emits check-scoped narrowing.

The confusing parts were concrete. `help agents` documents consumption rather than authoring, while the useful author sequence is behind `help author`/`generate`. The generated slug copied the beginning of the long intent (`create-bundled-deepgram-doctor-for`) instead of suggesting the product name, so the explicit scaffold used `deepgram`. No recipe expresses forbidden options, enum-family compatibility, or complete nested request shapes, so all five checks required a custom fact traversal. Ordinary fixtures cannot assert semantic narrowing or null score/grade, which required the separate `verify-gap.mjs` stake runner.

## Shipped boundary

| Check | Definite evidence | Limits and uncertainty |
| --- | --- | --- |
| `endpoint-model-mismatch` | Literal or locally stable model on a proven official raw URL with resolved native identity, direct `@deepgram/sdk` client path, direct browser-agent provider object, or a stable same-file `agent.v1.createConnection()` receiver passed `sendSettings(...)`. Statically known non-string Voice Agent `type`, `version`, and `model` fields and primitive/null providers are definite schema violations. | Raw identity is queried only after a static official Deepgram URL establishes relevance. An explicitly supplied Deepgram Voice Agent provider without `version` is evaluated with Deepgram's v1 default; an entirely omitted speak provider remains the valid Flux default. Dynamic provider values, mutated or escaped options, and opaque connection relationships narrow. Cross-file wrappers are not executed. |
| `unsupported-streaming-option` | Proven raw WebSocket query or direct SDK streaming options for listen v1/v2 and speak v2, including the documented v2 `language` exclusion, v1 streaming `detect_language` exclusion, and Flux `language_hint` model constraint | Opaque options and unknown Flux models narrow. Mid-session Configure messages are outside scope. |
| `invalid-read-request` | Fully known raw JSON `fetch` or `client.read.v1.text.analyze` request | Raw `text/plain`, remote content type, opaque bodies, and computed runtime queries narrow or remain outside scope. |
| `wrong-deepgram-host` | Literal official global/regional Deepgram host plus proven API path | Dedicated, self-hosted, proxy, and dynamic hosts are outside scope. |
| `browser-api-key-exposure` | Nonempty literal `auth.apiKey` or recognized public `VITE_*`/`NEXT_PUBLIC_*` value passed to a direct call, constructor, or `AgentProvider` JSX element from a Deepgram browser package | Cross-module configs, opaque credentials, and unresolved JSX spreads narrow. |

The doctor deliberately omits Nova-versus-Flux product preferences, retry and keepalive schedules, audio-byte correctness, pricing/access, callback ordering, and self-hosted sizing.

The browser check reports direct literal exposure and public `import.meta.env.VITE_*` or `process.env.NEXT_PUBLIC_*` credentials passed through proven browser-package calls, constructors, or `AgentProvider` JSX configuration. Cross-module configuration remains outside the supported local flow.

## Verification

The first acceptance verdict was rejected by independent review. The repair round added four missing boundaries without changing the independent seeds: omitted Voice Agent provider versions now use the documented v1 default when the provider is present; the streaming matrix covers `language`, `detect_language`, and the Flux `language_hint` model constraint; same-file stable SDK agent connections are traced through `sendSettings`; and native fetch accepts byte-case-insensitive `POST`. Fixtures include the nearest valid controls, unrelated methods, stable aliases, escaped or mutated uncertainty, and a definite finding beside an uncertain candidate.

A second independent review found that a statically known numeric Voice Agent model reached a string-only family operation and crashed the doctor. The repair classifies known primitive, object, and null provider shapes before any type-specific operation. Definite schema violations produce type-accurate findings; opaque provider values narrow `endpoint-model-mismatch`; valid provider objects stay clean. The same audit confirmed that other source-derived string operations are guarded or operate on internal strings.

Real-project acceptance then rejected an overbroad raw-call candidate boundary. The pinned official JavaScript SDK initially produced 43 unrelated `identity/unresolved-identity` occurrences because every call was queried as a possible native fetch before its URL was examined. The repair resolves a static URL first and invokes shared fetch/WebSocket identity only for official Deepgram hosts. Dynamic URLs, non-Deepgram services, custom proxies, Dedicated, and self-hosted URLs are outside this raw candidate set. An incompatible official URL with conditional native identity still narrows only its implicated check, and a neighboring definite finding remains visible.

Final results:

- `node bin/cli.js verify doctors/deepgram.mjs --format json` — **44 passed, 0 failed, 0 skipped**.
- `node docs/evidence/deepgram-doctor-authoring/verify-gap.mjs` — **6 passed, 0 failed, 0 skipped**. This validates the former environment-identity failure, definite and negative controls, opaque credentials, and uncertain and mixed JSX spreads.
- `node bin/cli.js run doctors/deepgram.mjs docs/evidence/deepgram-doctor-authoring/held-out --format json` — **7 files, 4 exact findings, 0 crashes, 0 broken, 0 unsafe skips**; scoped uncertainty was retained beside definite findings and score/grade were null.
- Unchanged independent cases under `/tmp/any-doctor-deepgram-independent`: `namespace-positive` — **1 `endpoint-model-mismatch`**, no narrowing; `omitted-version` — **1 `endpoint-model-mismatch`**, no narrowing; `sdk-send-settings` — **1 `endpoint-model-mismatch`**, no narrowing; `unsupported-options` — **4 `unsupported-streaming-option` findings**, no narrowing; `lowercase-post` — **0 findings**, no narrowing, **100 / Excellent**; `nonstring-provider` — **1 `endpoint-model-mismatch`** at line 3 with the message `Voice Agent speak provider model must be a string; received number.`, no narrowing. Every case had 0 crashes, 0 broken checks, and 0 unsafe skips.
- A mixed provider-shape stake produced **1 exact malformed-model finding**, retained **1 opaque-provider narrowing**, yielded null score/grade, and had 0 crashes, broken checks, or unsafe skips; its valid neighboring provider was clean.
- Candidate-boundary stakes: many unrelated unresolved calls and literal non-Deepgram URLs each produced **0 findings, no narrowing, 100 / Excellent**; stable native/global aliases produced **2 exact findings with no narrowing**; an incompatible official URL with conditional identity produced **0 findings, one affected check (`endpoint-model-mismatch`), and null score/grade**; the mixed case preserved **1 exact finding** beside that same scoped uncertainty and null score/grade. Every stake had 0 crashes, broken checks, and unsafe skips.
- `node bin/cli.js run doctors/deepgram.mjs /tmp/deepgram-js-sdk-review.hly8de --format json` at commit `3bb661b3711212de03a17e1e8189132cfd055457` — **627 files, 0 findings, 0 narrowing, 100 / Excellent**, with 0 crashes, broken checks, or unsafe skips. Every one of the prior 43 identity occurrences was adjudicated as unrelated and removed by the candidate boundary.
- `npm test` — **1,077 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**.
- `node bin/cli.js verify --all --format json` — **6 doctors; 331 passed, 0 failed, 10 explicit skips** across 341 rows; 0 crashes and 0 unsafe skips.
- `node --check doctors/deepgram.mjs`, `node --check doctors/deepgram.fixtures.mjs`, and `node --check docs/evidence/deepgram-doctor-authoring/verify-gap.mjs` — passed.
- `git diff --check` on every changed tracked/untracked file — passed.

The held-out cases are separate from the authored fixture matrix. They challenge a `globalThis.WebSocket` alias, local shadows and unrelated property names, opaque Read configuration, a definite SDK mismatch beside multiple uncertain candidates, a proven SDK `sendSettings` mismatch beside an escaped connection, reassignment, and escape to an opaque function.

## Real-project repair

The initial acceptance verdict was reopened after scanning Deepgram's public JavaScript projects. That run found four false positives on valid flattened Read requests, one false positive on prerecorded Flux through the v1 media SDK, one `.js` JSX parser crash, broad uncertainty from ordinary browser hooks, and missing JSX credential coverage.

The shared analyzer now accepts JSX in `.js`, `.mjs`, and `.cjs`, exposes JSX elements and prop value IDs, resolves stable CommonJS `require()` identities, and records file-scoped provider uncertainty instead of aborting the whole scan when one file cannot be analyzed. The Deepgram doctor now distinguishes prerecorded and streaming Listen calls, accepts both flattened and nested Read request forms, restricts browser configuration checks to actual configuration entry points, understands `ws`, and checks direct, namespace-imported, and ordered-spread `AgentProvider` JSX credentials.

The repaired doctor was run against exact public revisions:

| Project | Commit | Files | Findings | Uncertainty |
| --- | --- | ---: | ---: | ---: |
| `deepgram/recipes` | `536a47f36b66e29cc869cd7975238e40fcdf491e` | 47 | 0 | 0 |
| `deepgram/examples` | `66ed79166ad6476b7b5a1a1207825d1d36c59615` | 58 | 0 | 0 |
| `deepgram-starters/node-voice-agent` | `499aa47c1a724e968cc30890dd413d4ba1147b0b` | 1 | 0 | 0 |
| `deepgram-starters/node-live-transcription` | `7f7f0d7059dc4584c9614452655f1b2c1ae7a241` | 1 | 0 | 0 |
| `deepgram-devs/deepgram-demos-flux-streaming` | `7a118b1aad92f070e802b63df5d20b7444588823` | 1 | 0 | 0 |
| `deepgram/dg_react_agent` | `7191eb4a062f35344896e873f02eba69c9c46a2d` | 18 | 0 | 0 |
| `deepgram/ui` | `108e3fa0f3827e5023593bf54e0b00a92e3ba9ea` | 25 | 0 | 0 |
| `deepgram/deepgram-js-sdk` | `3bb661b3711212de03a17e1e8189132cfd055457` | 627 | 0 | 0 |

The public application and example projects contribute 151 analyzed files; the SDK adds 627. The doctor fixtures now include the valid official shapes and intentionally broken neighbors. Final verification is 44 passed, 0 failed, 0 skipped for Deepgram; the full automated suite is 1,077 passed, 0 failed; and all-doctor verification is 331 passed, 0 failed, 10 explicit skips across 341 rows.

## Deepgram trial files

- `README.md`
- `doctors/deepgram.mjs`
- `doctors/deepgram.fixtures.mjs`
- `docs-site/src/content/docs/doctors/deepgram.mdx`
- `docs/evidence/deepgram-doctor-authoring/trial-report.md`
- `docs/evidence/deepgram-doctor-authoring/browser-env-capability-gap.json`
- `docs/evidence/deepgram-doctor-authoring/verify-gap.mjs`
- `docs/evidence/deepgram-doctor-authoring/held-out/definite-positive.ts`
- `docs/evidence/deepgram-doctor-authoring/held-out/negative-control.ts`
- `docs/evidence/deepgram-doctor-authoring/held-out/uncertain-control.ts`
- `docs/evidence/deepgram-doctor-authoring/held-out/mixed-neighbor.ts`
- `docs/evidence/deepgram-doctor-authoring/held-out/mutated-options.ts`
- `docs/evidence/deepgram-doctor-authoring/held-out/escaped-options.ts`
- `docs/evidence/deepgram-doctor-authoring/held-out/sdk-settings-mixed.ts`

The later real-project repair also changed the shared analyzer and its focused
tests in `src/analysis.ts`, `src/value-flow.ts`, `src/sdk.ts`,
`src/doctor-sdk.ts`, `test/call-facts.test.mjs`,
`test/value-flow.test.mjs`, `test/sdk-custom-narrowing.test.mjs`, and
`test/doctor-sdk.test.mjs`. The author guidance was updated in
`docs-site/src/content/docs/authoring/testing-doctors.mdx`,
`docs-site/src/content/docs/authoring/trustworthy-doctor.mdx`,
`docs/doctor-sdk.md`, `skill/author-workflow.md`, `skill/any-doctor.skill.md`,
and `doctors/AGENTS.md`.

No existing user-owned implementation work was reset, cleaned, staged, committed, pushed, or published.
