"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAgent = resolveAgent;
exports.agentArgs = agentArgs;
const child_process_1 = require("child_process");
function resolveAgent(explicit) {
    const candidates = [];
    if (explicit)
        candidates.push(explicit);
    if (process.env.ANY_DOCTOR_AGENT)
        candidates.push(process.env.ANY_DOCTOR_AGENT);
    candidates.push("claude", "codex", "opencode");
    for (const cand of candidates) {
        if (!cand)
            continue;
        const bin = cand.split(/\s+/)[0];
        const r = (0, child_process_1.spawnSync)("sh", ["-c", "command -v " + bin], { encoding: "utf8" });
        if (r.status === 0 && r.stdout.trim()) {
            return { raw: cand, bin, path: r.stdout.trim() };
        }
    }
    return null;
}
function agentArgs(agent, prompt) {
    if (agent.bin === "claude") {
        return ["-p", prompt, "--allowedTools", "Read,Edit,Write,Bash", "--permission-mode", "acceptEdits"];
    }
    if (agent.bin === "codex") {
        return ["exec", "--full-auto", prompt];
    }
    if (agent.bin === "opencode") {
        return ["run", "--auto", prompt];
    }
    if (agent.raw.includes("{prompt}")) {
        return agent.raw.split(/\s+/).slice(1).map(a => a.replace("{prompt}", prompt));
    }
    return agent.raw.split(/\s+/).slice(1).concat([prompt]);
}
