# Deepgram doctor research

Research date: 2026-09-21
Primary catalog: [`deepgram/skills` at `c56c10b`](https://github.com/deepgram/skills/tree/c56c10b9394581cb17cc5977760c66fc48cb931c/skills)
JavaScript SDK skills: [`deepgram/deepgram-js-sdk` at `3bb661b`](https://github.com/deepgram/deepgram-js-sdk/tree/3bb661b3711212de03a17e1e8189132cfd055457/.agents/skills)

## Recommendation

A bundled doctor named **Deepgram** is justified. Deepgram's official skills contain unusually concrete failure contracts: incompatible endpoint/model families, REST-only features placed on WebSockets, invalid static request shapes, wrong hosts, and browser credential exposure. These are stronger raw materials than general style advice because many can be proved from a call's identity plus literal or locally stable configuration.

The first release should be deliberately narrow: JavaScript and TypeScript, raw `fetch`/`WebSocket` calls, `@deepgram/sdk`, and Deepgram's browser-agent packages. It should report only when it can establish Deepgram provenance and the incompatible configuration. Dynamic URLs, models, options, or receiver identity should narrow the affected check rather than produce a finding or a clean score.

The catalog has 14 top-level skills covering API contracts, STT, TTS, voice agents, audio/text intelligence, browser agents, CLI, self-hosting, examples, recipes, starters, docs, and MCP setup. The best doctor rules come mainly from [`api`](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/api/SKILL.md#common-mistakes-to-avoid), [`speech-to-text`](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/speech-to-text/SKILL.md#common-mistakes), [`text-to-speech`](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/text-to-speech/SKILL.md#common-mistakes), [`voice-agent`](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/voice-agent/SKILL.md#common-mistakes), [`text-intelligence`](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/text-intelligence/SKILL.md#common-mistakes), [`audio-intelligence`](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/audio-intelligence/SKILL.md#common-mistakes), and [`browser-agent`](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/browser-agent/SKILL.md#common-mistakes). The `docs`, `examples`, `recipes`, `starters`, and `setup-mcp` skills mostly route agents to information or projects rather than define source-level defects.

## Prioritized first release

### 1. Browser API key exposure

**Claim:** A client/browser Deepgram agent configuration receives a long-lived API key instead of a server-minted short-lived token.

This is the clearest high-impact check. Deepgram explicitly says that `{ auth: { apiKey } }` in browser code publishes a billable credential and recommends `tokenFactory`; the official authentication contract distinguishes API keys (`Token`) from temporary JWTs (`Bearer`) ([browser-agent skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/browser-agent/SKILL.md#browser-auth-never-the-api-key), [Deepgram authentication](https://developers.deepgram.com/reference/authentication), [token grant](https://developers.deepgram.com/reference/auth/tokens/grant)).

Report only when both sides are proven:

- the consumer is `@deepgram/agents`, `@deepgram/react`, `@deepgram/ui`, or `@deepgram/agents-widget`, or a known browser-agent constructor/provider; and
- the `apiKey` value is a literal, a stable binding with an API-key name, or a public client environment binding such as `NEXT_PUBLIC_*`/`VITE_*`.

Do not flag server-side `@deepgram/sdk` initialization, `tokenFactory`, a short-lived JWT, or an opaque configuration. A generic property named `apiKey` is not enough.

**Needed SDK facts:** import/call identity, stable aliases, ordered object-property resolution, module/client provenance, environment-binding identity. If client provenance is not public and reliable, ship only the browser-package forms initially.

### 2. Endpoint/model or provider-version mismatch

**Claim:** A statically known Deepgram endpoint or SDK namespace is paired with a model family it cannot serve.

Deepgram has separate, non-interchangeable product families:

- Flux STT uses `/v2/listen` and `flux-general-*`; it does not work on `/v1/listen` ([speech-to-text skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/speech-to-text/SKILL.md#common-mistakes)).
- Aura models use `/v1/speak`; Flux TTS models use `/v2/speak`, where `model` is required ([text-to-speech skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/text-to-speech/SKILL.md#common-mistakes)).
- Voice Agent `listen.provider.version` and `speak.provider.version` select the product family and must agree with their models ([voice-agent configuration](https://developers.deepgram.com/docs/configure-voice-agent), [voice-agent skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/voice-agent/SKILL.md#connect-configure-stream)).

Cover raw endpoint URLs and known SDK calls such as `client.listen.v1.*`, `client.listen.v2.createConnection`, `client.speak.v1.*`, and `client.speak.v2.*`. Report only literal or resolved-stable models. A missing `/v2/speak` model is reportable only when the complete effective option object is known; spreads or opaque configuration must narrow.

**Likely false positives:** custom proxies that translate model names, shadowed clients, intentionally malformed test fixtures, and dynamic model registries. Require Deepgram provenance, exclude standard test/generated paths by policy, and make proxy origins unknown unless the project explicitly declares them.

**Needed SDK facts:** call identity including namespace/default aliases, bounded URL/template evaluation, effective object options with spreads and overrides, nested property lookup, and check-scoped uncertainty.

### 3. Unsupported option on a known transport

**Claim:** A statically known Deepgram streaming call includes an option that the selected transport rejects or silently ignores.

High-confidence pairs include:

- `/v2/listen` with Nova-only flags such as `smart_format`, `diarize`, `summarize`, `sentiment`, `topics`, `intents`, or `detect_entities` ([API skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/api/SKILL.md#flux-stt-model-v2listen), [Flux reference](https://developers.deepgram.com/reference/speech-to-text/listen-flux)).
- Nova WebSocket calls with REST-only `summarize`, `topics`, `intents`, `sentiment`, or `detect_language`; only the documented streaming subset should be accepted ([audio-intelligence skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/audio-intelligence/SKILL.md#feature-matrix)).
- `/v2/speak` WebSockets with compressed/container encodings (`mp3`, `opus`, `flac`, `aac`) or batch-only `container`, `bit_rate`, `callback`, `callback_method`, or `priority` ([API skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/api/SKILL.md#flux-tts-v2speak), [Flux TTS streaming quickstart](https://developers.deepgram.com/docs/flux-tts/quickstart)).

Use exact product/transport matrices in doctor-owned data. Do not create findings for merely optional or recommended choices. An unknown option spread must narrow rather than be treated as absence.

**Needed SDK facts:** call identity, transport identity, effective option presence/value, stable aliases, and unknown spread/mutation handling. This maps closely to the current identity and option-presence foundations, but an “option must not be present / option value must belong to enum” reusable recipe would reduce custom doctor logic.

### 4. Invalid static Read API request

**Claim:** A proven `/v1/read` request has a statically invalid shape.

Deepgram requires `language`, at least one supported analysis feature, and exactly one of `text` or `url`; `detect_entities` is not supported, the API is POST-only, and a URL must point to text rather than audio ([text-intelligence skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/text-intelligence/SKILL.md#the-body-exactly-one-of-text-or-url), [Read reference](https://developers.deepgram.com/reference/text-intelligence/analyze-text)). The official JS SDK shape is `client.read.v1.text.analyze({ body: { text | url }, language, ...feature })` ([JS text-intelligence skill](https://github.com/deepgram/deepgram-js-sdk/blob/3bb661b3711212de03a17e1e8189132cfd055457/.agents/skills/deepgram-js-text-intelligence/SKILL.md#quick-start)).

Initial findings should be limited to fully known request objects:

- missing `language`;
- both or neither of `body.text` and `body.url`;
- no supported feature enabled;
- `detect_entities` present;
- raw Deepgram `/v1/read` request using a non-POST literal method.

Do not try to infer whether an arbitrary remote URL serves audio in the first release. A literal filename extension can be a review candidate later, but content type is runtime state.

**Needed SDK facts:** raw fetch URL/method identity, SDK call identity, complete nested object shape, literal values, and option completeness.

### 5. Wrong Deepgram host for a proven API path

**Claim:** A literal Deepgram URL pairs a product path with a host that does not serve it.

Globally, Voice Agent lives on `agent.deepgram.com`, while other APIs live on `api.deepgram.com`; regional Voice Agent endpoints are the documented exception and use regional `api.*` hosts. Management APIs must remain on the global API host because the regional hosts return 404 ([API skill regional rules](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/api/SKILL.md#regional-endpoints), [Voice Agent reference](https://developers.deepgram.com/reference/voice-agent/voice-agent), [regional endpoints](https://developers.deepgram.com/reference/regional-endpoints)).

This is a precise literal-URL check. Support bounded templates only when the host and path are statically proven. Custom/self-hosted endpoints, proxy URLs, and opaque base URLs should be outside the candidate set, not warnings.

**Needed SDK facts:** bounded URL/template evaluation and exact source locations. No whole-program reasoning is needed.

## Good second-release candidates

These are valuable but require stronger receiver/value-flow proof or a narrower supported syntax contract:

- **TTS binary response parsed as JSON.** REST TTS returns audio bytes, not JSON ([text-to-speech skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/text-to-speech/SKILL.md#common-mistakes), [JS TTS skill](https://github.com/deepgram/deepgram-js-sdk/blob/3bb661b3711212de03a17e1e8189132cfd055457/.agents/skills/deepgram-js-text-to-speech/SKILL.md#quick-start-rest-one-shot)). A finding needs proven response ownership through `await`, aliases, and receiver calls; matching `.json()` textually would be noisy.
- **Deepgram API key sent with `Bearer`.** The rule is valid only when the value is proven to be a long-lived API key; Bearer is correct for grant-issued JWTs ([authentication](https://developers.deepgram.com/reference/authentication)). Start with explicit `DEEPGRAM_API_KEY` flows and abstain on opaque credentials.
- **Deepgram React packages split across incompatible installed versions.** The browser skill documents a real duplicate-context failure when `@deepgram/react@0.2.0` is combined with `@deepgram/ui@0.1.6` ([browser-agent skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/browser-agent/SKILL.md#common-mistakes)). This belongs in a package-resolution check pinned to a verified compatibility matrix, not a timeless source rule.
- **Wrong response field for summary.** `/v1/read` uses `results.summary.text`; `/v1/listen` uses `results.summary.short` ([API skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/api/SKILL.md#text-and-audio-intelligence-v1read-v1listen)). It is precise only when the response's originating call survives aliases/destructuring.
- **Known WebSocket control sent as binary.** STT `KeepAlive` must be a text frame and audio must be binary ([speech-to-text skill](https://github.com/deepgram/skills/blob/c56c10b9394581cb17cc5977760c66fc48cb931c/skills/speech-to-text/SKILL.md#common-mistakes)). Detecting `socket.send(Buffer.from(JSON.stringify({type:"KeepAlive"})))` is useful, but generic socket ownership and serialization flow should be independently challenged before release.

## Advice that should not become findings

The following guidance is useful for agents but too contextual, temporal, or runtime-dependent for default findings:

- choosing Nova versus Flux, Voice Agent versus an orchestrator, a starter, recipe, or deployment region;
- exact pricing, model availability, project entitlement, or whether a 403 means a typo versus missing access;
- whether an audio encoding matches the actual bytes, whether sample rates match physical devices, or whether a URL serves a particular content type;
- whether `Retry-After`, keepalive scheduling, timestamp offsets, reconnection, barge-in playback clearing, or whitespace between generations is correct across arbitrary control flow;
- Settings/message ordering across event callbacks unless a bounded path analysis proves the sequence;
- self-hosted hardware sizing, driver versions, upgrade ordering, licensing, sales-gated model files, or Kubernetes topology;
- CLI-version quirks and pre-1.0 package compatibility unless the installed version is resolved and the rule is explicitly version-scoped;
- recommendations such as cancellation, model discovery, using the custom client wrapper, or choosing `keyterm` over `keywords` when the alternative is not always invalid.

These belong in documentation, contextual review candidates, or future version-scoped checks. Converting them directly into findings would make the doctor opinionated and brittle.

## Proposed implementation boundary

The first Deepgram doctor should declare five occurrence-based checks, corresponding to the five first-release rules above. Each check needs its own claim, impact, fix, lookalikes, and blind spots. Findings should be warnings except browser credential exposure, which merits error severity when the long-lived-key flow is proven.

Every check should have, at minimum:

1. a definite raw-API positive;
2. a definite SDK positive;
3. a valid neighboring Deepgram configuration;
4. an unrelated service with the same property/model names;
5. local/shadowed client and global-call controls;
6. aliases, wrappers, computed properties, and ordered object spreads;
7. an opaque or mutated configuration that narrows with null score;
8. a definite finding beside an uncertain candidate;
9. packaged-artifact parity; and
10. held-out examples derived independently from the fixtures.

The doctor should not use regexes over whole files to infer API identity. It should enumerate calls, prove the Deepgram call or URL, resolve the relevant configuration through public SDK facts, and abstain when the effective value is unknown. That boundary is what turns Deepgram's strong instructions into a trustworthy default doctor rather than a large collection of textual guesses.

## Minimal shipping order

1. Ship **model/endpoint mismatch**, **unsupported streaming option**, and **invalid Read request** first. They share call identity plus effective object configuration and have clear positive/negative controls.
2. Add **wrong host** in the same release if bounded URL evaluation already covers raw calls without new engine work.
3. Add **browser API key exposure** only after client provenance and credential identity survive independent adversarial cases. It is the most important check, but a generic `apiKey` search would be unacceptable.
4. Defer response-consumption, message-ordering, and cross-event lifecycle checks until public flow facts can prove them or safely narrow them.

This scope would make the bundled Deepgram doctor useful immediately without claiming that Any Doctor can validate an entire real-time audio application.
