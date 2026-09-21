import { DeepgramClient } from "@deepgram/sdk";
const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
const options = { model: "flux-general-en" };
inspect(options);
client.listen.v1.createConnection(options);
