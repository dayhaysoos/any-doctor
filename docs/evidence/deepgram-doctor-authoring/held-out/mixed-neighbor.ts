import { DeepgramClient } from "@deepgram/sdk";
import { AgentSession } from "@deepgram/agents";
const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
client.listen.v1.createConnection({ model: "flux-general-multi" });
client.listen.v2.connect(loadOptions());
new AgentSession({ auth: { apiKey: import.meta.env.VITE_DEEPGRAM_API_KEY }, agent: "id" });
