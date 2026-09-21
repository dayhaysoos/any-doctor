import { DeepgramClient } from "@deepgram/sdk";
const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
client.read.v1.text.analyze(makeRequest());
