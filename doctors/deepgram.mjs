export const meta = {
  id: "deepgram",
  description: "Find proven Deepgram endpoint, transport, request-shape, host, and browser credential mistakes.",
  severity: "warning",
  category: "deepgram",
  blindSpots: [
    "Checks use bounded same-file call and value facts. Cross-file builders, reassignment, mutation, and opaque helpers narrow an established Deepgram candidate.",
    "Raw API checks query native fetch or WebSocket identity only after a statically known official Deepgram URL establishes relevance. Dynamic URLs, unrelated URLs, custom proxies, Dedicated, and self-hosted hosts are outside the candidate set.",
    "SDK checks cover direct clients created by DeepgramClient or createClient from @deepgram/sdk and direct browser-package calls, constructors, or AgentProvider JSX. Arbitrary wrapper factories and cross-module configuration are not resolved.",
    "The browser credential check reports nonempty literal apiKey values and recognized VITE_ or NEXT_PUBLIC_ environment values. Other nonliteral credentials and unresolved JSX prop spreads narrow.",
    "Runtime response behavior, audio bytes, pricing, access, callback order, retries, keepalives, and self-hosted sizing are outside this doctor.",
  ],
  checks: [
    {
      id: "endpoint-model-mismatch", revision: 5, reportingUnit: "occurrence", needs: ["calls", "identity", "value-path"], onUnknown: "narrow", severity: "warning",
      description: "Deepgram endpoint or provider settings conflict with the model family or schema.",
      claim: "A proven Deepgram streaming endpoint, SDK namespace, or browser-agent provider has a statically known model from an incompatible family, a statically known non-string type/version/model field, or a fully known /v2/speak configuration omits its required model.",
      impact: "Deepgram rejects the request or cannot serve the selected model family.",
      why: "Flux STT requires listen v2, Flux TTS requires speak v2, Aura requires speak v1, Voice Agent provider versions must match their model families, and provider type/version/model fields are strings.",
      fix: "Use an object provider with string type/version/model fields, change the endpoint or provider version together with the model so the product family agrees, and provide a Flux TTS model on speak v2.",
      lookalikes: ["Nova on listen v1", "Flux STT on listen v2", "Aura on speak v1", "Custom proxy URLs", "Unrelated clients with model fields"],
      blindSpots: ["Dynamic models and opaque option objects narrow after Deepgram provenance is established. SDK Voice Agent Settings are followed only from a bounded same-file agent.v1 connection; custom aliases implemented outside the file are not executed."],
    },
    {
      id: "unsupported-streaming-option", revision: 3, reportingUnit: "occurrence", needs: ["calls", "identity", "value-path"], onUnknown: "narrow", severity: "warning",
      description: "Deepgram streaming transport receives an unsupported static option.",
      claim: "A proven Deepgram WebSocket or SDK streaming connection has a statically present option that its selected listen or speak transport does not support.",
      impact: "The WebSocket handshake can fail, or the requested analysis may be silently absent.",
      why: "Flux listen excludes the v1 language option and restricts language_hint to flux-general-multi, Nova streaming excludes detect_language and most intelligence overlays, and Flux TTS streaming accepts only raw audio encodings and no batch-only options.",
      fix: "Remove the unsupported option or move the workload to the Deepgram endpoint and transport that supports it.",
      lookalikes: ["detect_entities on Nova streaming", "Batch REST intelligence", "Raw Flux TTS encodings", "Same option names on unrelated sockets"],
      blindSpots: ["Opaque URL parameters and option objects narrow. Mid-session Configure message validation is outside this check."],
    },
    {
      id: "invalid-read-request", revision: 3, reportingUnit: "occurrence", needs: ["calls", "identity", "value-path"], onUnknown: "narrow", severity: "warning",
      description: "A fully known Deepgram /v1/read request has an invalid static shape.",
      claim: "A proven raw or SDK Read request is fully known and omits language, enables no supported analysis feature, uses detect_entities, supplies both or neither text and url, or uses a non-POST raw method.",
      impact: "Deepgram rejects the Read request instead of producing text analysis.",
      why: "Read is POST-only, requires language and at least one supported feature, accepts exactly one text source, and does not support entity detection.",
      fix: "Send POST /v1/read with language, one supported feature, and exactly one of text or url; remove detect_entities.",
      lookalikes: ["Audio intelligence on /v1/listen", "Valid text or url Read requests", "Opaque request builders", "Unrelated analyze methods"],
      blindSpots: ["Raw text/plain bodies and remote URL content types are not classified. Opaque or mutated request objects narrow."],
    },
    {
      id: "wrong-deepgram-host", revision: 2, reportingUnit: "occurrence", needs: ["calls", "identity"], onUnknown: "narrow", severity: "warning",
      description: "A literal official Deepgram host cannot serve the proven API path.",
      claim: "A native fetch or WebSocket uses a statically known official Deepgram global or regional host with an incompatible proven path.",
      impact: "The request reaches the wrong Deepgram service and returns a connection or not-found error.",
      why: "Global Voice Agent paths use agent.deepgram.com, other global APIs use api.deepgram.com, and regional hosts do not serve Projects management paths.",
      fix: "Use agent.deepgram.com for global /v1/agent paths, api.deepgram.com for other global APIs and Projects, or a documented regional api host for regional data-plane APIs.",
      lookalikes: ["Regional Voice Agent on api.<region>.deepgram.com", "Dedicated and self-hosted endpoints", "Custom proxies", "Non-Deepgram URLs"],
      blindSpots: ["Dynamically constructed URLs and custom hosts are outside the raw candidate set."],
    },
    {
      id: "browser-api-key-exposure", revision: 3, reportingUnit: "occurrence", needs: ["calls", "identity", "value-path"], onUnknown: "narrow", severity: "error",
      description: "A proven Deepgram browser package receives a long-lived or public API key.",
      claim: "A direct @deepgram/agents, @deepgram/react, @deepgram/ui, or @deepgram/agents-widget call, constructor, or JSX element receives auth.apiKey whose value is a nonempty literal or a public browser environment variable.",
      impact: "Anyone who loads the browser bundle can recover and bill against the exposed Deepgram credential.",
      why: "Deepgram browser agents authenticate with server-minted short-lived tokens through tokenFactory; apiKey is for server-side or local use.",
      fix: "Mint a short-lived token on an authenticated server route and pass a tokenFactory that fetches it.",
      lookalikes: ["tokenFactory", "Server-side @deepgram/sdk clients", "Opaque credentials", "Non-public server environment variables", "Unrelated apiKey properties"],
      blindSpots: ["Cross-module config factories are not resolved. Nonliteral apiKey values without a recognized public browser environment identity narrow rather than report."],
    },
  ],
};

const UNKNOWN = Symbol("unknown");
const FETCH = { globals: ["fetch", "globalThis.fetch", "window.fetch", "self.fetch"] };
const WEBSOCKET = {
  globals: ["WebSocket", "globalThis.WebSocket", "window.WebSocket", "self.WebSocket"],
  imports: [{ source: "ws", names: ["default", "WebSocket", "*"] }],
};
const BROWSER_SOURCES = new Set(["@deepgram/agents", "@deepgram/react", "@deepgram/ui", "@deepgram/agents-widget"]);
const BROWSER_CONFIG_APIS = new Set(["AgentSession", "useDeepgramAgent"]);
const READ_FEATURES = ["summarize", "sentiment", "topics", "intents"];
const V2_LISTEN_UNSUPPORTED = ["smart_format", "diarize", "diarize_model", "summarize", "sentiment", "topics", "intents", "detect_entities", "punctuate", "language"];
const V1_LISTEN_STREAM_UNSUPPORTED = ["summarize", "sentiment", "topics", "intents", "detect_language"];
const V2_SPEAK_BATCH_ONLY = ["container", "bit_rate", "callback", "callback_method", "priority"];
const V2_SPEAK_COMPRESSED = new Set(["mp3", "opus", "flac", "aac"]);

export async function doctor(ctx) {
  if (!ctx.analysis.available) return;
  for (const file of ctx.files.list()) {
    if (!file.endsWith(".fixtures.mjs")) inspectFile(ctx, file);
  }
}

function inspectFile(ctx, file) {
  const facts = ctx.analysis.calls(file);
  const flow = facts.structure.flow;
  const values = new Map(flow.values.map((value) => [value.id, value]));
  const flowBindings = new Map(flow.bindings.map((binding) => [binding.binding, binding]));
  const bindingStates = new Map(facts.structure.bindings.map((binding) => [binding.binding, binding]));
  const byStart = new Map(flow.values.map((value) => [value.start, value]));
  const narrowed = new Set();
  let observation;
  const observe = (value) => { observation = value; };
  function allowedEscape(target) {
    const path = [target.root, ...target.members].filter(Boolean).join(".");
    if (target.binding === null && ["fetch", "globalThis.fetch", "window.fetch", "self.fetch", "JSON.stringify", "WebSocket", "globalThis.WebSocket", "window.WebSocket", "self.WebSocket"].includes(path)) return true;
    if (BROWSER_SOURCES.has(target.source)) return true;
    if (target.binding != null && target.members.join(".") === "sendSettings") {
      const receiver = flowBindings.get(target.binding)?.initializer ?? byStart.get(bindingStates.get(target.binding)?.initializer)?.id;
      if (possibleAgentConnection(receiver)) return true;
    }
    if (target.binding == null || !/^(listen\.(?:v1|v2)|speak\.(?:v1|v2)|read\.v1)\./.test(target.members.join("."))) return false;
    const initializer = values.get(flowBindings.get(target.binding)?.initializer);
    if (!initializer || !["call", "construct"].includes(initializer.kind)) return false;
    const name = identityName(initializer.callee);
    return ["@deepgram/sdk:DeepgramClient", "@deepgram/sdk:*.DeepgramClient", "@deepgram/sdk:createClient", "@deepgram/sdk:*.createClient"].includes(name);
  }
  const isStable = (binding) => {
    const state = bindingStates.get(binding);
    return !state?.reassigned && !state?.mutated && !(state?.escapes ?? []).some((target) => !allowedEscape(target));
  };
  const narrow = (check, call, reason = "unsupported-expression", capability = "calls") => {
    const key = `${check}:${call?.start ?? "file"}:${reason}`;
    if (narrowed.has(key)) return;
    narrowed.add(key);
    ctx.report.narrowing({ check, file, reason, capability });
  };

  function resolve(id, seen = new Set()) {
    if (id === undefined || seen.has(id)) return UNKNOWN;
    const value = values.get(id);
    if (!value) return UNKNOWN;
    seen = new Set(seen).add(id);
    if (value.kind === "await") return resolve(value.value, seen);
    if (value.kind === "reference" && value.target?.binding != null) {
      const binding = value.target.binding;
      if (!isStable(binding)) return UNKNOWN;
      const initial = flowBindings.get(binding)?.initializer;
      if (initial !== undefined) return resolve(initial, seen);
      const state = bindingStates.get(binding);
      if (state?.initializer !== undefined) {
        let current = resolve(byStart.get(state.initializer)?.id, seen);
        for (const key of state.path ?? []) current = localPropertyValue(current, key, seen);
        return current;
      }
    }
    if (value.kind === "member") {
      const receiver = resolve(value.receiver, seen);
      if (receiver?.kind === "object") return localPropertyValue(receiver, value.member, seen);
    }
    if (value.alternatives) {
      const alternatives = value.alternatives.map((part) => resolve(part, seen));
      const first = alternatives[0];
      if (alternatives.length && alternatives.every((part) => first === part || first !== UNKNOWN && part !== UNKNOWN && first?.kind === "literal" && part?.kind === "literal" && first.literal === part.literal)) return first;
      return UNKNOWN;
    }
    return value;
  }

  function localPropertyValue(object, name, seen = new Set()) {
    if (object === undefined || (object?.kind === "literal" && object.literal === null)) return undefined;
    if (object === UNKNOWN || object?.kind !== "object" || name === null) return UNKNOWN;
    const state = `property:${object.id}:${name}`;
    if (seen.has(state)) return UNKNOWN;
    seen = new Set(seen).add(state);
    let result;
    for (const item of object.properties ?? []) {
      if (item.spread) { const nested = localPropertyValue(resolve(item.value, seen), name, seen); if (nested !== undefined) result = nested; }
      else if (item.name === null) result = UNKNOWN;
      else if (item.name === name) result = item.accessor ? UNKNOWN : resolve(item.value, seen);
      else if (item.name === "__proto__" && result === undefined) result = UNKNOWN;
    }
    return result;
  }
  function propertyPath(id, path, at = observation) {
    const object = id === undefined ? undefined : values.get(id);
    if (object === undefined || (object?.kind === "literal" && object.literal === null)) return undefined;
    if (object === UNKNOWN || path.some(name => name === null) || !at) return UNKNOWN;
    const result = ctx.analysis.valueAtPath(file, { id: object.id, start: object.start, end: object.end }, {
      at: { id: at.id, start: at.start, end: at.end }, path,
    });
    if (result.status === "unknown") return UNKNOWN;
    if (result.value.state === "absent") return undefined;
    const terminal = values.get(result.value.expression.id) ?? byStart.get(result.value.expression.start);
    if (!terminal) return UNKNOWN;
    return Object.hasOwn(result.value, "constant") ? { ...terminal, kind: "literal", literal: result.value.constant } : terminal;
  }

  function propertyValue(object, name, at = observation) { return propertyPath(object?.id, [name], at); }

  const property = (id, name, at = observation) => propertyPath(id, [name], at);
  function literal(id, seen = new Set()) {
    const value = resolve(id);
    if (!value || value === UNKNOWN || seen.has(value.id)) return UNKNOWN;
    if (value.kind === "literal") return value.literal;
    if (!value.template) return UNKNOWN;
    seen = new Set(seen).add(value.id);
    let text = value.template.quasis[0];
    if (text === null) return UNKNOWN;
    for (let index = 0; index < value.template.expressions.length; index++) {
      const part = literal(value.template.expressions[index], seen);
      const suffix = value.template.quasis[index + 1];
      if (part === UNKNOWN || suffix === null) return UNKNOWN;
      text += String(part) + suffix;
    }
    return text;
  }

  function identityName(id, seen = new Set()) {
    const value = resolve(id);
    if (!value || value === UNKNOWN || seen.has(value.id)) return UNKNOWN;
    seen = new Set(seen).add(value.id);
    if (value.kind === "member") {
      const receiver = identityName(value.receiver, seen);
      return receiver === UNKNOWN || value.member === null ? UNKNOWN : `${receiver}.${value.member}`;
    }
    const target = value.target;
    if (!target) return UNKNOWN;
    if (target.source) return `${target.source}:${target.importedName}${target.members.length ? `.${target.members.join(".")}` : ""}`;
    if (target.binding === null) return [target.root, ...target.members].join(".");
    return undefined;
  }

  function memberChain(id) {
    let value = resolve(id);
    const members = [];
    const seen = new Set();
    while (value?.kind === "member") {
      if (seen.has(value.id) || value.member === null) return UNKNOWN;
      seen.add(value.id);
      members.unshift(value.member);
      value = resolve(value.receiver);
    }
    return value === UNKNOWN ? UNKNOWN : { root: value, members };
  }

  function sdkCall(call) {
    const chain = memberChain(call.callee);
    if (!chain || chain === UNKNOWN) return chain;
    if (!chain.root || !["call", "construct"].includes(chain.root.kind)) return undefined;
    const name = identityName(chain.root.callee);
    const client = chain.root.kind === "construct"
      ? ["@deepgram/sdk:DeepgramClient", "@deepgram/sdk:*.DeepgramClient"].includes(name)
      : chain.root.kind === "call" && ["@deepgram/sdk:createClient", "@deepgram/sdk:*.createClient"].includes(name);
    return client ? { path: chain.members.join(".") } : undefined;
  }

  function nativeIdentity(call, query) {
    const subject = call.kind === "construct" ? values.get(call.callee) : call;
    if (!subject) return UNKNOWN;
    const reference = { id: subject.id, start: subject.start, end: subject.end };
    const result = call.kind === "construct"
      ? ctx.analysis.identity(file, reference, query)
      : ctx.analysis.callIdentity(file, reference, query);
    return result.status === "unknown" ? UNKNOWN : result.value.matches;
  }

  function urlFact(call, kind) {
    const value = literal(call.arguments?.[0]);
    if (value === UNKNOWN) return UNKNOWN;
    if (typeof value !== "string") return undefined;
    try { return { kind, parsed: new URL(value) }; } catch { return undefined; }
  }
  function officialDeepgramUrl(url) {
    const host = url.parsed.hostname.toLowerCase();
    return host === "api.deepgram.com" || host === "agent.deepgram.com" || /^api\.(eu|au|in)\.deepgram\.com$/.test(host);
  }
  function narrowRawIdentity(call, url, kind) {
    const path = url.parsed.pathname;
    if (hostMismatch(url)) narrow("wrong-deepgram-host", call, "unresolved-identity", "identity");
    if (["/v1/listen", "/v2/listen", "/v1/speak", "/v2/speak"].includes(path)) {
      const model = url.parsed.searchParams.get("model") ?? undefined;
      if (endpointModelMismatch(path, model, kind === "websocket")) narrow("endpoint-model-mismatch", call, "unresolved-identity", "identity");
    }
    if (kind === "websocket" && ["/v1/listen", "/v2/listen", "/v2/speak"].includes(path)) narrow("unsupported-streaming-option", call, "unresolved-identity", "identity");
    if (kind === "fetch" && path === "/v1/read") narrow("invalid-read-request", call, "unresolved-identity", "identity");
  }

  function knownObject(id) {
    const value = resolve(id);
    return value === UNKNOWN ? UNKNOWN : value?.kind === "object" ? value : UNKNOWN;
  }
  function jsonBody(initId) {
    const body = property(initId, "body");
    if (body === undefined || body === UNKNOWN) return body;
    return body.kind === "call" && identityName(body.callee) === "JSON.stringify" ? knownObject(body.arguments?.[0]) : UNKNOWN;
  }
  function optionLiteral(optionsId, name) {
    const value = property(optionsId, name);
    if (value === UNKNOWN || value === undefined) return value;
    return identityName(value.id) === "undefined" ? undefined : literal(value.id);
  }
  function schemaValue(objectId, name) {
    const value = property(objectId, name);
    if (value === UNKNOWN || value === undefined) return value;
    if (identityName(value.id) === "undefined") return undefined;
    const resolved = resolve(value.id);
    if (resolved === UNKNOWN || resolved === undefined) return UNKNOWN;
    if (resolved.kind === "literal") {
      return { value: resolved.literal, type: resolved.literal === null ? "null" : typeof resolved.literal };
    }
    if (resolved.kind === "object") return { type: "object" };
    return UNKNOWN;
  }
  function schemaKind(value) {
    if (value === UNKNOWN || value === undefined) return value;
    if (value.kind === "literal") return value.literal === null ? "null" : typeof value.literal;
    if (value.kind === "object") return "object";
    return UNKNOWN;
  }
  function findPresent(optionsId, names) {
    const present = [];
    for (const name of names) {
      const value = property(optionsId, name);
      if (value === UNKNOWN) return UNKNOWN;
      if (value !== undefined && identityName(value.id) !== "undefined") present.push(name);
    }
    return present;
  }
  function report(rule, call, message) {
    ctx.report.finding({ rule, file, line: call.line, column: call.column, message, evidence: { endLine: call.endLine, endColumn: call.endColumn } });
  }

  function checkMismatch(call, endpoint, optionsId) {
    const rule = "endpoint-model-mismatch";
    if (!endpoint.url && knownObject(optionsId) === UNKNOWN) return narrow(rule, call);
    const model = endpoint.url ? endpoint.url.parsed.searchParams.get("model") ?? undefined : optionLiteral(optionsId, "model");
    if (model === UNKNOWN) return narrow(rule, call);
    if (model !== undefined && typeof model !== "string") {
      return report(rule, call, `${endpoint.path} model must be a string; received ${model === null ? "null" : typeof model}.`);
    }
    const path = endpoint.path;
    const wrong = endpointModelMismatch(path, model, endpoint.streaming ?? true);
    if (wrong) report(rule, call, `${path} is incompatible with ${model === undefined ? "a missing model" : `model ${model}`}.`);
  }

  function checkStreaming(call, endpoint, optionsId) {
    const rule = "unsupported-streaming-option";
    const names = endpoint.path === "/v2/listen" ? V2_LISTEN_UNSUPPORTED : endpoint.path === "/v1/listen" ? V1_LISTEN_STREAM_UNSUPPORTED : endpoint.path === "/v2/speak" ? V2_SPEAK_BATCH_ONLY : [];
    let unsupported;
    let encoding;
    if (endpoint.url) {
      unsupported = names.filter((name) => endpoint.url.parsed.searchParams.has(name));
      encoding = endpoint.url.parsed.searchParams.get("encoding") ?? undefined;
    } else {
      if (knownObject(optionsId) === UNKNOWN) return narrow(rule, call);
      unsupported = findPresent(optionsId, names);
      encoding = optionLiteral(optionsId, "encoding");
      if (unsupported === UNKNOWN || encoding === UNKNOWN) return narrow(rule, call);
    }
    if (endpoint.path === "/v2/speak" && V2_SPEAK_COMPRESSED.has(encoding)) unsupported.push("encoding");
    if (endpoint.path === "/v2/listen") {
      const languageHint = endpoint.url
        ? endpoint.url.parsed.searchParams.has("language_hint") || endpoint.url.parsed.searchParams.has("language_hints")
        : [property(optionsId, "language_hint"), property(optionsId, "language_hints")];
      const hasLanguageHint = Array.isArray(languageHint)
        ? languageHint.some((value) => value !== undefined && value !== UNKNOWN && identityName(value.id) !== "undefined")
        : languageHint;
      if (Array.isArray(languageHint) && languageHint.includes(UNKNOWN)) return narrow(rule, call);
      if (hasLanguageHint) {
        const model = endpoint.url ? endpoint.url.parsed.searchParams.get("model") ?? undefined : optionLiteral(optionsId, "model");
        if (model === UNKNOWN || model === undefined) return narrow(rule, call);
        if (model !== "flux-general-multi") unsupported.push("language_hint");
      }
    }
    if (unsupported.length) report(rule, call, `${endpoint.path} streaming does not support: ${[...new Set(unsupported)].join(", ")}.`);
  }

  function checkRead(call, endpoint, optionsId, raw) {
    const rule = "invalid-read-request";
    const query = endpoint.url?.parsed.searchParams;
    const request = knownObject(optionsId);
    if (request === UNKNOWN) return narrow(rule, call);
    const nestedBody = raw ? undefined : property(optionsId, "body", call);
    if (nestedBody === UNKNOWN) return narrow(rule, call);
    const body = raw ? jsonBody(optionsId) : nestedBody ?? request;
    if (body === UNKNOWN || (body !== undefined && body.kind !== "object")) return narrow(rule, call);
    const problems = [];
    if (raw) {
      const method = optionLiteral(optionsId, "method");
      if (method === UNKNOWN) return narrow(rule, call);
      if (typeof method !== "string" || method.toUpperCase() !== "POST") problems.push("method must be POST");
    }
    const field = (name) => raw ? (query.has(name) ? query.get(name) : undefined) : optionLiteral(optionsId, name);
    const language = field("language");
    if (language === UNKNOWN) return narrow(rule, call);
    if (language === undefined) problems.push("language is missing");
    let enabled = false;
    for (const feature of READ_FEATURES) {
      const value = field(feature);
      if (value === UNKNOWN) return narrow(rule, call);
      if (value !== undefined && value !== false && value !== "false") enabled = true;
    }
    if (!enabled) problems.push("no supported analysis feature is enabled");
    const entities = field("detect_entities");
    if (entities === UNKNOWN) return narrow(rule, call);
    if (entities !== undefined) problems.push("detect_entities is unsupported");
    const bodyId = raw ? body?.id : nestedBody?.id ?? optionsId;
    const text = property(bodyId, "text", call);
    const url = property(bodyId, "url", call);
    if (text === UNKNOWN || url === UNKNOWN) return narrow(rule, call);
    if ((text === undefined) === (url === undefined)) problems.push("body must contain exactly one of text or url");
    if (problems.length) report(rule, call, `Invalid Deepgram Read request: ${problems.join("; ")}.`);
  }

  function endpointModelMismatch(path, model, streaming = true) {
    return (streaming && path === "/v1/listen" && typeof model === "string" && model.startsWith("flux-general-"))
      || (path === "/v2/listen" && typeof model === "string" && !model.startsWith("flux-general-"))
      || (path === "/v1/speak" && typeof model === "string" && model.startsWith("flux-"))
      || (path === "/v2/speak" && (model === undefined || (typeof model === "string" && !model.startsWith("flux-"))));
  }

  function hostMismatch(url) {
    const host = url.parsed.hostname.toLowerCase();
    const path = url.parsed.pathname;
    const regional = /^api\.(eu|au|in)\.deepgram\.com$/.test(host);
    return host === "api.deepgram.com" && path.startsWith("/v1/agent")
      || host === "agent.deepgram.com" && !path.startsWith("/v1/agent")
      || regional && path.startsWith("/v1/projects");
  }
  function checkHost(call, url) {
    const host = url.parsed.hostname.toLowerCase();
    const path = url.parsed.pathname;
    const wrong = hostMismatch(url);
    if (wrong) report("wrong-deepgram-host", call, `${host} does not serve ${path}.`);
  }

  function checkVoiceProvider(call, configId) {
    const rule = "endpoint-model-mismatch";
    if (knownObject(configId) === UNKNOWN) return narrow(rule, call);
    const at = values.has(call.id) ? call : observation;
    const agent = propertyPath(configId, ["agent"], at);
    if (agent === UNKNOWN) return narrow(rule, call);
    if (agent === undefined) return;
    if (agent.kind !== "object") return;
    for (const side of ["listen", "speak"]) {
      const section = propertyPath(configId, ["agent", side], at);
      if (section === UNKNOWN) { narrow(rule, call); continue; }
      if (section === undefined) continue;
      if (section.kind !== "object") { narrow(rule, call); continue; }
      const provider = propertyPath(configId, ["agent", side, "provider"], at);
      if (provider === UNKNOWN) { narrow(rule, call); continue; }
      if (provider !== undefined && provider.kind !== "object") {
        const kind = schemaKind(provider);
        if (kind === UNKNOWN) narrow(rule, call);
        else report(rule, call, `Voice Agent ${side} provider must be an object; received ${kind}.`);
        continue;
      }
      const field = (name) => {
        const value = propertyPath(configId, ["agent", side, "provider", name], at);
        if (value === UNKNOWN || value === undefined) return value;
        if (identityName(value.id) === "undefined") return undefined;
        const resolved = resolve(value.id);
        if (resolved === UNKNOWN || resolved === undefined) return UNKNOWN;
        if (resolved.kind === "literal") return { value: resolved.literal, type: resolved.literal === null ? "null" : typeof resolved.literal };
        if (resolved.kind === "object") return { type: "object" };
        return UNKNOWN;
      };
      const typeFact = field("type");
      const versionFact = field("version");
      const modelFact = field("model");
      if ([typeFact, versionFact, modelFact].includes(UNKNOWN)) { narrow(rule, call); continue; }
      if (typeFact !== undefined && typeFact.type !== "string") {
        report(rule, call, `Voice Agent ${side} provider type must be a string; received ${typeFact.type}.`);
        continue;
      }
      const type = typeFact?.value;
      if (type !== undefined && type !== "deepgram") continue;
      if (versionFact !== undefined && versionFact.type !== "string") {
        report(rule, call, `Voice Agent ${side} provider version must be a string; received ${versionFact.type}.`);
        continue;
      }
      if (modelFact !== undefined && modelFact.type !== "string") {
        report(rule, call, `Voice Agent ${side} provider model must be a string; received ${modelFact.type}.`);
        continue;
      }
      const declaredVersion = versionFact?.value;
      const model = modelFact?.value;
      if (model === undefined) continue;
      const version = declaredVersion ?? "v1";
      const familyMatches = side === "listen" ? (version === "v2") === model.startsWith("flux-general-") : (version === "v2") === model.startsWith("flux-");
      if (!familyMatches) report(rule, call, `Voice Agent ${side} provider version ${version} conflicts with model ${model}.`);
    }
  }

  function possibleAgentConnection(id, seen = new Set()) {
    if (id === undefined || seen.has(id)) return false;
    seen = new Set(seen).add(id);
    const value = values.get(id);
    if (!value) return false;
    if (value.kind === "await") return possibleAgentConnection(value.value, seen);
    if (value.kind === "reference" && value.target?.binding != null) {
      const state = bindingStates.get(value.target.binding);
      const initial = flowBindings.get(value.target.binding)?.initializer ?? byStart.get(state?.initializer)?.id;
      return possibleAgentConnection(initial, seen);
    }
    if (value.alternatives) return value.alternatives.some((part) => possibleAgentConnection(part, seen));
    return value.kind === "call" && sdkCall(value)?.path === "agent.v1.createConnection";
  }

  function voiceSettingsCall(call) {
    const rawCallee = values.get(call.callee);
    if (rawCallee?.kind !== "member" || rawCallee.member !== "sendSettings") return undefined;
    const chain = memberChain(call.callee);
    if (chain === UNKNOWN) return possibleAgentConnection(rawCallee.receiver) ? UNKNOWN : undefined;
    if (chain?.members.join(".") !== "sendSettings" || chain.root?.kind !== "call") return undefined;
    return sdkCall(chain.root)?.path === "agent.v1.createConnection" ? true : undefined;
  }

  function publicCredential(id) {
    const value = resolve(id);
    if (!value || value === UNKNOWN) return UNKNOWN;
    if (value.kind === "literal") return typeof value.literal === "string" && value.literal.length > 0;
    const identity = identityName(value.id);
    if (typeof identity === "string" && /^(?:import\.meta\.env\.VITE_|process\.env\.NEXT_PUBLIC_)/.test(identity)) return true;
    return UNKNOWN;
  }

  function browserEntry(call) {
    const chain = memberChain(call.callee);
    if (chain === UNKNOWN) return UNKNOWN;
    const target = chain?.root?.target ?? resolve(call.callee)?.target;
    if (!target?.source) return undefined;
    const name = target.importedName === "*" ? chain?.members?.[0] : target.importedName;
    return { source: target.source, name };
  }
  function jsxBrowserEntry(element) {
    const target = element.target;
    if (!target?.source) return undefined;
    const name = target.importedName === "*" && target.members.length === 1
      ? target.members[0]
      : target.importedName;
    return { source: target.source, name };
  }
  function jsxConfig(element) {
    let config;
    for (const attribute of element.attributes) {
      if (attribute.spread) {
        observe(values.get(attribute.value));
        const spread = knownObject(attribute.value);
        if (spread === UNKNOWN) config = UNKNOWN;
        else {
          const spreadConfig = propertyValue(spread, "config");
          if (spreadConfig !== undefined) config = spreadConfig === UNKNOWN ? UNKNOWN : spreadConfig.id;
        }
      } else if (attribute.name === "config") {
        config = attribute.value ?? UNKNOWN;
      }
    }
    return config;
  }
  function checkBrowserCredential(call, source, configId = call.arguments?.[0]) {
    const rule = "browser-api-key-exposure";
    if (!BROWSER_SOURCES.has(source)) return;
    const at = values.has(call.id) ? call : observation;
    // Preserve this Doctor's pre-Value-Path conservative policy: once a
    // browser config binding escapes or mutates anywhere in the file, abstain.
    // The shared Value Path query itself remains observation-relative.
    const resolvedConfig = resolve(configId);
    const config = resolvedConfig === UNKNOWN ? UNKNOWN : resolvedConfig?.kind === "object" ? resolvedConfig : UNKNOWN;
    if (config === UNKNOWN) return narrow(rule, call);
    const auth = propertyPath(configId, ["auth"], at);
    const apiKey = auth === UNKNOWN ? UNKNOWN : auth === undefined
      ? propertyPath(configId, ["apiKey"], at)
      : propertyPath(configId, ["auth", "apiKey"], at);
    if (apiKey === UNKNOWN) return narrow(rule, call);
    if (apiKey === undefined) return;
    const exposed = publicCredential(apiKey.id);
    if (exposed === UNKNOWN) narrow(rule, call);
    else if (exposed) report(rule, call, "A Deepgram browser package receives a literal or public client API key.");
  }

  for (const call of flow.values.filter((value) => (value.kind === "call" || value.kind === "construct") && !value.dead)) {
    observe(call);
    const kind = call.kind === "construct" ? "websocket" : "fetch";
    const url = urlFact(call, kind);
    if (url && url !== UNKNOWN && officialDeepgramUrl(url)) {
      const raw = nativeIdentity(call, call.kind === "construct" ? WEBSOCKET : FETCH);
      if (raw === UNKNOWN) narrowRawIdentity(call, url, kind);
      else if (raw === true) {
        checkHost(call, url);
        const endpoint = { path: url.parsed.pathname, url, streaming: kind === "websocket" };
        if (["/v1/listen", "/v2/listen", "/v1/speak", "/v2/speak"].includes(endpoint.path)) checkMismatch(call, endpoint);
        if (kind === "websocket" && ["/v1/listen", "/v2/listen", "/v2/speak"].includes(endpoint.path)) checkStreaming(call, endpoint);
        if (kind === "fetch" && endpoint.path === "/v1/read") checkRead(call, endpoint, call.arguments?.[1], true);
      }
    }

    const sdk = sdkCall(call);
    if (sdk && sdk !== UNKNOWN) {
      let endpoint;
      let optionsId;
      let streaming = false;
      if (sdk.path.startsWith("listen.v1.")) { streaming = /(?:createConnection|connect)$/.test(sdk.path); endpoint = { path: "/v1/listen", streaming }; optionsId = sdk.path.endsWith("transcribeFile") ? call.arguments?.[1] : call.arguments?.[0]; }
      else if (sdk.path.startsWith("listen.v2.")) { streaming = true; endpoint = { path: "/v2/listen", streaming }; optionsId = call.arguments?.[0]; }
      else if (sdk.path.startsWith("speak.v1.")) { streaming = /(?:createConnection|connect)$/.test(sdk.path); endpoint = { path: "/v1/speak", streaming }; optionsId = call.arguments?.[0]; }
      else if (sdk.path.startsWith("speak.v2.")) { streaming = /(?:createConnection|connect)$/.test(sdk.path); endpoint = { path: "/v2/speak", streaming }; optionsId = call.arguments?.[0]; }
      else if (sdk.path === "read.v1.text.analyze") { endpoint = { path: "/v1/read" }; optionsId = call.arguments?.[0]; }
      if (endpoint?.path === "/v1/read") checkRead(call, endpoint, optionsId, false);
      else if (endpoint) checkMismatch(call, endpoint, optionsId);
      if (endpoint && streaming) checkStreaming(call, endpoint, optionsId);
    }

    const browser = browserEntry(call);
    if (browser !== UNKNOWN && browser && BROWSER_SOURCES.has(browser.source) && BROWSER_CONFIG_APIS.has(browser.name)) {
      checkBrowserCredential(call, browser.source);
      checkVoiceProvider(call, call.arguments?.[0]);
    }
    const settings = voiceSettingsCall(call);
    if (settings === UNKNOWN) narrow("endpoint-model-mismatch", call);
    else if (settings) checkVoiceProvider(call, call.arguments?.[0]);
  }

  for (const element of flow.jsxElements ?? []) {
    const browser = jsxBrowserEntry(element);
    if (!browser || !BROWSER_SOURCES.has(browser.source) || browser.name !== "AgentProvider") continue;
    const config = jsxConfig(element);
    if (config === undefined) continue;
    if (config === UNKNOWN) {
      narrow("browser-api-key-exposure", element);
      narrow("endpoint-model-mismatch", element);
      continue;
    }
    observe(values.get(config));
    checkBrowserCredential(element, browser.source, config);
    checkVoiceProvider(element, config);
  }
}
