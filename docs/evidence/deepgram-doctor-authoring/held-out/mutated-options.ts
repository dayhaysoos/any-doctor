import { DeepgramClient } from "@deepgram/sdk";
const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
const options = { model: "flux-general-en" };
options.model = chooseModel();
client.listen.v2.connect(options);
