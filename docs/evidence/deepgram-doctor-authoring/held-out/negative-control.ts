function WebSocket(_url: string) {}
new WebSocket("wss://api.deepgram.com/v1/listen?model=flux-general-en");
const service = { send(_value: unknown) {} };
service.send({ model: "flux-general-en", topics: true });
