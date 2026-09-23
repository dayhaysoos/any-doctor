export const fixtures = [
  {
    name: "reports raw endpoint model family mismatches",
    seed: { "src/raw.ts": `
new WebSocket("wss://api.deepgram.com/v1/listen?model=flux-general-en");
new WebSocket("wss://api.deepgram.com/v2/listen?model=nova-3");
fetch("https://api.deepgram.com/v1/speak?model=flux-alexis-en", { method: "POST" });
fetch("https://api.deepgram.com/v2/speak", { method: "POST" });
` },
    expected: [
      { rule: "endpoint-model-mismatch", file: "src/raw.ts", line: 2 },
      { rule: "endpoint-model-mismatch", file: "src/raw.ts", line: 3 },
      { rule: "endpoint-model-mismatch", file: "src/raw.ts", line: 4 },
      { rule: "endpoint-model-mismatch", file: "src/raw.ts", line: 5 },
    ],
  },
  {
    name: "keeps unrelated unresolved calls and non-Deepgram URLs outside the raw candidate set",
    seed: { "src/raw-candidate-safe.ts": `
const uncertain = condition ? fetch : other;
uncertain(buildUrl());
uncertain("https://example.com/v1/listen?model=flux-general-en");
const Socket = condition ? WebSocket : LocalSocket;
new Socket("wss://stream.example.com/v1/listen?model=flux-general-en");
ordinary({ model: "flux-general-en" });
factory()();
` },
    expected: [],
  },
  {
    name: "preserves raw findings through established native global aliases",
    seed: { "src/raw-aliases.ts": `
const request = globalThis.fetch;
const Socket = globalThis.WebSocket;
request("https://api.deepgram.com/v1/speak?model=flux-alexis-en", { method: "POST" });
new Socket("wss://api.deepgram.com/v1/listen?model=flux-general-en");
` },
    expected: [
      { rule: "endpoint-model-mismatch", file: "src/raw-aliases.ts", line: 4 },
      { rule: "endpoint-model-mismatch", file: "src/raw-aliases.ts", line: 5 },
    ],
  },
  {
    name: "official URLs with unresolved raw identity abstain",
    seed: { "src/raw-identity-unknown.ts": `
const request = condition ? fetch : other;
request("https://api.deepgram.com/v1/listen?model=flux-general-en");
` },
    expected: [],
  },
  {
    name: "preserves a definite raw finding beside official-URL identity uncertainty",
    seed: { "src/raw-identity-mixed.ts": `
new WebSocket("wss://api.deepgram.com/v1/listen?model=flux-general-en");
const request = condition ? fetch : other;
request("https://api.deepgram.com/v1/speak?model=flux-alexis-en", { method: "POST" });
` },
    expected: [
      { rule: "endpoint-model-mismatch", file: "src/raw-identity-mixed.ts", line: 2 },
    ],
  },
  {
    name: "reports SDK endpoint model mismatches through stable clients",
    seed: { "src/sdk.ts": `
import { DeepgramClient as Client } from "@deepgram/sdk";
const dg = new Client({ apiKey: process.env.DEEPGRAM_API_KEY });
dg.listen.v1.createConnection({ model: "flux-general-multi" });
dg.listen.v2.connect({ model: "nova-3" });
dg.speak.v1.audio.generate({ text: "hi", model: "flux-alexis-en" });
dg.speak.v2.createConnection({ encoding: "linear16" });
` },
    expected: [
      { rule: "endpoint-model-mismatch", file: "src/sdk.ts", line: 4 },
      { rule: "endpoint-model-mismatch", file: "src/sdk.ts", line: 5 },
      { rule: "endpoint-model-mismatch", file: "src/sdk.ts", line: 6 },
      { rule: "endpoint-model-mismatch", file: "src/sdk.ts", line: 7 },
    ],
  },
  {
    name: "keeps valid endpoint and model neighbors quiet",
    seed: { "src/valid.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-3&detect_entities=true");
new WebSocket("wss://api.deepgram.com/v2/listen?model=flux-general-en");
dg.speak.v1.audio.generate({ text: "hi", model: "aura-2-thalia-en" });
dg.speak.v2.audio.generate({ text: "hi", model: "flux-alexis-en", encoding: "mp3" });
` },
    expected: [],
  },
  {
    name: "preserves legacy whole-file stability while retaining a definite SDK neighbor",
    seed: { "src/sdk-stability.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
const unstable = { model: "flux-general-multi", detect_language: true };
dg.listen.v1.createConnection(unstable);
unstable.extra = true;
dg.listen.v1.createConnection({ model: "flux-general-multi" });
` },
    expected: [
      { rule: "endpoint-model-mismatch", file: "src/sdk-stability.ts", line: 7 },
    ],
  },
  {
    name: "reports unsupported raw streaming options",
    seed: { "src/raw-stream.ts": `
new WebSocket("wss://api.deepgram.com/v2/listen?model=flux-general-en&smart_format=true&topics=true");
new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-3&sentiment=true");
new WebSocket("wss://api.deepgram.com/v2/speak?model=flux-alexis-en&encoding=mp3&container=wav");
` },
    expected: [
      { rule: "unsupported-streaming-option", file: "src/raw-stream.ts", line: 2 },
      { rule: "unsupported-streaming-option", file: "src/raw-stream.ts", line: 3 },
      { rule: "unsupported-streaming-option", file: "src/raw-stream.ts", line: 4 },
    ],
  },
  {
    name: "reports documented listen version option conflicts for raw and SDK sockets",
    seed: { "src/listen-options.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
dg.listen.v2.createConnection({ model: "flux-general-en", language: "en" });
dg.listen.v1.createConnection({ model: "nova-3", detect_language: true });
dg.listen.v2.connect({ model: "flux-general-en", language_hint: "en" });
new WebSocket("wss://api.deepgram.com/v2/listen?model=flux-general-en&language=en");
new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-3&detect_language=true");
new WebSocket("wss://api.deepgram.com/v2/listen?model=flux-general-en&language_hint=en");
` },
    expected: [
      { rule: "unsupported-streaming-option", file: "src/listen-options.ts", line: 4 },
      { rule: "unsupported-streaming-option", file: "src/listen-options.ts", line: 5 },
      { rule: "unsupported-streaming-option", file: "src/listen-options.ts", line: 6 },
      { rule: "unsupported-streaming-option", file: "src/listen-options.ts", line: 7 },
      { rule: "unsupported-streaming-option", file: "src/listen-options.ts", line: 8 },
      { rule: "unsupported-streaming-option", file: "src/listen-options.ts", line: 9 },
    ],
  },
  {
    name: "accepts language hints only on the multilingual Flux model",
    seed: { "src/listen-options-valid.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
dg.listen.v2.connect({ model: "flux-general-multi", language_hint: "en" });
dg.listen.v2.connect({ model: "flux-general-multi", language_hints: ["en", "es"] });
new WebSocket("wss://api.deepgram.com/v2/listen?model=flux-general-multi&language_hint=en");
new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-3&detect_entities=true");
` },
    expected: [],
  },
  {
    name: "reports unsupported SDK streaming options after ordered spreads",
    seed: { "src/sdk-stream.ts": `
import { createClient } from "@deepgram/sdk";
const dg = createClient(process.env.DEEPGRAM_API_KEY);
const base = { topics: true, smart_format: true };
dg.listen.v2.connect({ ...base, smart_format: false });
dg.listen.v1.createConnection({ model: "nova-3", summarize: "v2" });
dg.speak.v2.createConnection({ model: "flux-alexis-en", encoding: "opus" });
` },
    expected: [
      { rule: "unsupported-streaming-option", file: "src/sdk-stream.ts", line: 5 },
      { rule: "unsupported-streaming-option", file: "src/sdk-stream.ts", line: 6 },
      { rule: "unsupported-streaming-option", file: "src/sdk-stream.ts", line: 7 },
    ],
  },
  {
    name: "resolves static computed Deepgram option properties",
    seed: { "src/computed.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
dg.listen.v1.createConnection({ ["model"]: "flux-general-en" });
dg.listen.v2.connect({ model: "flux-general-en", ["topics"]: true });
` },
    expected: [
      { rule: "endpoint-model-mismatch", file: "src/computed.ts", line: 4 },
      { rule: "unsupported-streaming-option", file: "src/computed.ts", line: 5 },
    ],
  },
  {
    name: "reports fully known invalid raw Read requests",
    seed: { "src/raw-read.ts": `
fetch("https://api.deepgram.com/v1/read?summarize=true", { method: "GET", body: JSON.stringify({ text: "a", url: "https://example.com/a.txt" }) });
fetch("https://api.deepgram.com/v1/read?language=en&detect_entities=true", { method: "POST", body: JSON.stringify({}) });
` },
    expected: [
      { rule: "invalid-read-request", file: "src/raw-read.ts", line: 2 },
      { rule: "invalid-read-request", file: "src/raw-read.ts", line: 3 },
    ],
  },
  {
    name: "reports fully known invalid SDK Read requests",
    seed: { "src/sdk-read.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
dg.read.v1.text.analyze({ language: "en", body: { text: "a" } });
dg.read.v1.text.analyze({ language: "en", sentiment: true, detect_entities: true, body: { text: "a", url: "https://example.com/a.txt" } });
` },
    expected: [
      { rule: "invalid-read-request", file: "src/sdk-read.ts", line: 4 },
      { rule: "invalid-read-request", file: "src/sdk-read.ts", line: 5 },
    ],
  },
  {
    name: "keeps valid Read requests quiet",
    seed: { "src/valid-read.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
fetch("https://api.deepgram.com/v1/read?language=en&summarize=v2", { method: "POST", body: JSON.stringify({ text: "hello" }) });
dg.read.v1.text.analyze({ language: "en", topics: true, body: { url: "https://example.com/doc.txt" } });
` },
    expected: [],
  },
  {
    name: "keeps official v5 flattened Read requests with local text quiet",
    seed: { "src/official-read.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
const TEXT = "A valid " + "document";
dg.read.v1.text.analyze({ text: TEXT, language: "en", sentiment: true });
dg.read.v1.text.analyze({ url: "https://example.com/doc.txt", language: "en", topics: true });
` },
    expected: [],
  },
  {
    name: "keeps official prerecorded Flux SDK requests quiet while rejecting streaming v1",
    seed: { "src/flux-batch.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
dg.listen.v1.media.transcribeUrl({ url: "https://dpgr.am/spacewalk.wav", model: "flux-general-en", smart_format: true });
dg.listen.v1.connect({ model: "flux-general-en" });
` },
    expected: [{ rule: "endpoint-model-mismatch", file: "src/flux-batch.ts", line: 5 }],
  },
  {
    name: "reports wrong global and regional Deepgram hosts",
    seed: { "src/hosts.ts": `
new WebSocket("wss://api.deepgram.com/v1/agent/converse");
fetch("https://agent.deepgram.com/v1/read?language=en&summarize=true", { method: "POST", body: JSON.stringify({ text: "hi" }) });
fetch("https://api.eu.deepgram.com/v1/projects/example", { method: "GET" });
` },
    expected: [
      { rule: "wrong-deepgram-host", file: "src/hosts.ts", line: 2 },
      { rule: "wrong-deepgram-host", file: "src/hosts.ts", line: 3 },
      { rule: "wrong-deepgram-host", file: "src/hosts.ts", line: 4 },
    ],
  },
  {
    name: "keeps correct regional and custom hosts quiet",
    seed: { "src/host-safe.ts": `
new WebSocket("wss://agent.deepgram.com/v1/agent/converse");
new WebSocket("wss://api.eu.deepgram.com/v1/agent/converse");
fetch("https://api.deepgram.com/v1/projects/example", { method: "GET" });
new WebSocket("wss://tenant.example.com/v1/listen?model=flux-general-en");
` },
    expected: [],
  },
  {
    name: "recognizes the ws package as a server WebSocket transport",
    seed: { "src/ws-package.js": `
import WebSocket from "ws";
const url = "wss://agent.deepgram.com/v1/agent/converse";
new WebSocket(url, { headers: { Authorization: "Token secret" } });
` },
    expected: [],
  },
  {
    name: "reports browser package literal API keys",
    seed: { "src/browser.ts": `
import { AgentSession } from "@deepgram/agents";
import { useDeepgramAgent } from "@deepgram/react";
new AgentSession({ auth: { apiKey: "dg_live_secret" }, agent: "id" });
useDeepgramAgent({ auth: { apiKey: "second_live_secret" }, agent: "id" });
` },
    expected: [
      { rule: "browser-api-key-exposure", file: "src/browser.ts", line: 4 },
      { rule: "browser-api-key-exposure", file: "src/browser.ts", line: 5 },
    ],
  },
  {
    name: "reports browser package API keys passed through JSX",
    seed: { "src/browser-jsx.tsx": `
import { AgentProvider } from "@deepgram/ui";
const publicKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
const nextPublicKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
export const Literal = () => <AgentProvider config={{ auth: { apiKey: "dg_live_secret" } }} />;
export const PublicEnv = () => <AgentProvider config={{ auth: { apiKey: publicKey } }} />;
export const NextPublicEnv = () => <AgentProvider config={{ auth: { apiKey: nextPublicKey } }} />;
` },
    expected: [
      { rule: "browser-api-key-exposure", file: "src/browser-jsx.tsx", line: 5 },
      { rule: "browser-api-key-exposure", file: "src/browser-jsx.tsx", line: 6 },
      { rule: "browser-api-key-exposure", file: "src/browser-jsx.tsx", line: 7 },
    ],
  },
  {
    name: "nested opaque transfer narrows instead of claiming the credential remains unchanged",
    seed: { "src/browser-wrapper.ts": `
import { AgentSession } from "@deepgram/agents";
const config = { auth: { apiKey: "dg_live_secret" } };
opaque({ config });
new AgentSession(config);
` },
    expected: [],
  },
  {
    name: "browser config mutation narrows without suppressing a definite neighbor",
    seed: { "src/browser-mutated.ts": `
import { AgentSession } from "@deepgram/agents";
const config = { auth: { apiKey: "uncertain_after_mutation" } };
config.normalize();
new AgentSession(config);
new AgentSession({ auth: { apiKey: "definite_neighbor" } });
` },
    expected: [
      { rule: "browser-api-key-exposure", file: "src/browser-mutated.ts", line: 6 },
    ],
  },
  {
    name: "JSX config transfer remains conservative beside a definite neighbor",
    seed: { "src/browser-jsx-mutated.tsx": `
import { AgentProvider } from "@deepgram/ui";
const config = { auth: { apiKey: "uncertain_after_transfer" } };
opaque(config);
export const Uncertain = () => <AgentProvider config={config} />;
export const Definite = () => <AgentProvider config={{ auth: { apiKey: "definite_neighbor" } }} />;
` },
    expected: [
      { rule: "browser-api-key-exposure", file: "src/browser-jsx-mutated.tsx", line: 6 },
    ],
  },
  {
    name: "reports browser API keys through namespace JSX and ordered prop spreads",
    seed: { "src/browser-jsx-spreads.tsx": `
import * as DeepgramUI from "@deepgram/ui";
import { AgentProvider } from "@deepgram/react";
const exposed = { config: { auth: { apiKey: "dg_spread_secret" } } };
const safe = { config: { auth: { tokenFactory: getToken } } };
export const Namespace = () => <DeepgramUI.AgentProvider config={{ auth: { apiKey: "dg_namespace_secret" } }} />;
export const Spread = () => <AgentProvider {...exposed} />;
export const OverriddenSafe = () => <AgentProvider {...exposed} {...safe} />;
` },
    expected: [
      { rule: "browser-api-key-exposure", file: "src/browser-jsx-spreads.tsx", line: 6 },
      { rule: "browser-api-key-exposure", file: "src/browser-jsx-spreads.tsx", line: 7 },
    ],
  },
  {
    name: "keeps JSX token factories and unrelated JSX props quiet",
    seed: { "src/browser-jsx-safe.tsx": `
import { AgentProvider } from "@deepgram/ui";
export const Safe = () => <AgentProvider config={{ auth: { tokenFactory: () => fetch("/api/deepgram-token").then(r => r.text()) } }} />;
export const Other = () => <OtherProvider config={{ auth: { apiKey: "unrelated" } }} />;
` },
    expected: [],
  },
  {
    name: "preserves a definite JSX credential finding beside an unresolved prop spread",
    seed: { "src/browser-jsx-uncertain.tsx": `
import { AgentProvider } from "@deepgram/ui";
export const Definite = () => <AgentProvider config={{ auth: { apiKey: "dg_live_secret" } }} />;
export const Uncertain = () => <AgentProvider {...runtimeProps} />;
` },
    expected: [
      { rule: "browser-api-key-exposure", file: "src/browser-jsx-uncertain.tsx", line: 3 },
    ],
  },
  {
    name: "keeps token factories server SDK keys and unrelated apiKey fields quiet",
    seed: { "src/key-safe.ts": `
import { AgentSession } from "@deepgram/agents";
import { DeepgramClient } from "@deepgram/sdk";
new AgentSession({ auth: { tokenFactory: () => fetch("/api/deepgram-token").then(r => r.text()) }, agent: "id" });
new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
configureService({ auth: { apiKey: "unrelated" } });
` },
    expected: [],
  },
  {
    name: "keeps browser hooks that do not accept agent configuration quiet",
    seed: { "src/browser-hooks.ts": `
import { useAgentConversation, useAgentState, useAgentMode } from "@deepgram/react";
useAgentConversation();
useAgentState();
useAgentMode();
` },
    expected: [],
  },
  {
    name: "reports voice provider version and model mismatches",
    seed: { "src/agent.ts": `
import { AgentSession } from "@deepgram/agents";
new AgentSession({ auth: { tokenFactory: getToken }, agent: { listen: { provider: { type: "deepgram", version: "v1", model: "flux-general-en" } } } });
new AgentSession({ auth: { tokenFactory: getToken }, agent: { speak: { provider: { type: "deepgram", version: "v2", model: "aura-2-thalia-en" } } } });
` },
    expected: [
      { rule: "endpoint-model-mismatch", file: "src/agent.ts", line: 3 },
      { rule: "endpoint-model-mismatch", file: "src/agent.ts", line: 4 },
    ],
  },
  {
    name: "applies the explicit Deepgram provider v1 default for listen and speak",
    seed: { "src/agent-defaults.ts": `
import { AgentSession } from "@deepgram/agents";
new AgentSession({ auth: { tokenFactory: getToken }, agent: { listen: { provider: { type: "deepgram", model: "flux-general-en" } } } });
new AgentSession({ auth: { tokenFactory: getToken }, agent: { speak: { provider: { type: "deepgram", model: "flux-alexis-en" } } } });
new AgentSession({ auth: { tokenFactory: getToken }, agent: { listen: { provider: { type: "deepgram", model: "nova-3" } }, speak: { provider: { type: "deepgram", model: "aura-2-thalia-en" } } } });
new AgentSession({ auth: { tokenFactory: getToken }, agent: { think: { provider: { type: "open_ai", model: "gpt-4o-mini" } } } });
` },
    expected: [
      { rule: "endpoint-model-mismatch", file: "src/agent-defaults.ts", line: 3 },
      { rule: "endpoint-model-mismatch", file: "src/agent-defaults.ts", line: 4 },
    ],
  },
  {
    name: "reports statically known malformed Voice Agent provider shapes without crashing",
    seed: { "src/provider-shapes.ts": `
import { AgentSession } from "@deepgram/agents";
new AgentSession({ auth: { tokenFactory: getToken }, agent: { speak: { provider: { type: "deepgram", version: "v2", model: 42 } } } });
new AgentSession({ auth: { tokenFactory: getToken }, agent: { speak: { provider: { type: "deepgram", version: "v2", model: {} } } } });
new AgentSession({ auth: { tokenFactory: getToken }, agent: { listen: { provider: { type: "deepgram", version: null, model: "nova-3" } } } });
new AgentSession({ auth: { tokenFactory: getToken }, agent: { listen: { provider: { type: false, model: "nova-3" } } } });
new AgentSession({ auth: { tokenFactory: getToken }, agent: { speak: { provider: "deepgram" } } });
new AgentSession({ auth: { tokenFactory: getToken }, agent: { speak: { provider: null } } });
new AgentSession({ auth: { tokenFactory: getToken }, agent: { listen: { provider: { type: "deepgram", version: "v1", model: "nova-3" } }, speak: { provider: { type: "deepgram", version: "v2", model: "flux-alexis-en" } } } });
new AgentSession({ auth: { tokenFactory: getToken }, agent: { speak: { provider: dynamicProvider } } });
` },
    expected: [
      { rule: "endpoint-model-mismatch", file: "src/provider-shapes.ts", line: 3 },
      { rule: "endpoint-model-mismatch", file: "src/provider-shapes.ts", line: 4 },
      { rule: "endpoint-model-mismatch", file: "src/provider-shapes.ts", line: 5 },
      { rule: "endpoint-model-mismatch", file: "src/provider-shapes.ts", line: 6 },
      { rule: "endpoint-model-mismatch", file: "src/provider-shapes.ts", line: 7 },
      { rule: "endpoint-model-mismatch", file: "src/provider-shapes.ts", line: 8 },
    ],
  },
  {
    name: "reports SDK Voice Agent Settings mismatches through stable connection and settings aliases",
    seed: { "src/sdk-settings.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
const connection = await client.agent.v1.createConnection();
const alias = connection;
const settings = { type: "Settings", agent: { speak: { provider: { type: "deepgram", version: "v1", model: "flux-alexis-en" } } } };
alias.sendSettings(settings);
` },
    expected: [{ rule: "endpoint-model-mismatch", file: "src/sdk-settings.ts", line: 7 }],
  },
  {
    name: "keeps valid and unrelated sendSettings methods quiet",
    seed: { "src/sdk-settings-safe.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
const connection = await client.agent.v1.createConnection();
connection.sendSettings({ type: "Settings", agent: { speak: { provider: { type: "deepgram", version: "v2", model: "flux-alexis-en" } } } });
other.sendSettings({ agent: { speak: { provider: { type: "deepgram", version: "v1", model: "flux-alexis-en" } } } });
` },
    expected: [],
  },
  {
    name: "preserves a definite Settings finding beside an escaped connection",
    seed: { "src/sdk-settings-mixed.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
const definite = await client.agent.v1.createConnection();
definite.sendSettings({ type: "Settings", agent: { listen: { provider: { type: "deepgram", version: "v1", model: "flux-general-en" } } } });
const uncertain = await client.agent.v1.createConnection();
inspect(uncertain);
uncertain.sendSettings({ type: "Settings", agent: { speak: { provider: { type: "deepgram", version: "v1", model: "flux-alexis-en" } } } });
` },
    expected: [{ rule: "endpoint-model-mismatch", file: "src/sdk-settings-mixed.ts", line: 5 }],
  },
  {
    name: "accepts lowercase POST for native Read fetch",
    seed: { "src/read-post.ts": `
fetch("https://api.deepgram.com/v1/read?language=en&sentiment=true", { method: "post", body: JSON.stringify({ text: "valid" }) });
fetch("https://api.deepgram.com/v1/read?language=en&topics=true", { method: "PoSt", body: JSON.stringify({ url: "https://example.com/doc.txt" }) });
` },
    expected: [],
  },
  {
    name: "keeps shadowed globals local clients and unrelated models quiet",
    seed: { "src/lookalikes.ts": `
function fetch() {}
class WebSocket {}
class DeepgramClient { listen = { v1: { createConnection() {} } } }
const local = new DeepgramClient();
fetch("https://api.deepgram.com/v1/read?language=en&summarize=true", {});
new WebSocket("wss://api.deepgram.com/v1/listen?model=flux-general-en");
local.listen.v1.createConnection({ model: "flux-general-en" });
other.send({ model: "flux-general-en", smart_format: true });
` },
    expected: [],
  },
  {
    name: "ordered overrides preserve effective option identity",
    seed: { "src/overrides.ts": `
import { DeepgramClient } from "@deepgram/sdk";
const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
const base = { model: "flux-general-en", smart_format: true };
dg.listen.v1.createConnection({ ...base, model: "nova-3" });
dg.listen.v2.connect({ ...base, smart_format: false });
` },
    expected: [{ rule: "unsupported-streaming-option", file: "src/overrides.ts", line: 6 }],
  },
  {
    name: "preserves a definite finding beside opaque candidates",
    seed: { "src/mixed.ts": `
import { DeepgramClient } from "@deepgram/sdk";
import { AgentSession } from "@deepgram/agents";
const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
dg.listen.v1.createConnection({ model: "flux-general-en" });
dg.listen.v2.connect(dynamicOptions);
dg.read.v1.text.analyze(buildReadRequest());
new AgentSession({ auth: { apiKey: getCredential() }, agent: "id" });
` },
    expected: [
      { rule: "endpoint-model-mismatch", file: "src/mixed.ts", line: 5 },
    ],
  },
  {
    name: "analysis-off abstains without speculative findings",
    analysis: "off",
    seed: { "src/off.ts": `new WebSocket("wss://api.deepgram.com/v1/listen?model=flux-general-en");\n` },
    expected: [],
  },
];
