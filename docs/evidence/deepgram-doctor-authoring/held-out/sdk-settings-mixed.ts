import { DeepgramClient } from "@deepgram/sdk";
const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
const definite = await client.agent.v1.createConnection();
definite.sendSettings({
  type: "Settings",
  agent: { speak: { provider: { type: "deepgram", model: "flux-alexis-en" } } },
});
const uncertain = await client.agent.v1.createConnection();
inspect(uncertain);
uncertain.sendSettings({
  type: "Settings",
  agent: { listen: { provider: { type: "deepgram", version: "v1", model: "flux-general-en" } } },
});
