import { spawnSync } from "child_process";

export interface Agent {
  raw: string;
  bin: string;
  path: string;
}

export function resolveAgent(explicit?: string): Agent | null {
  const candidates: string[] = [];
  if (explicit) candidates.push(explicit);
  if (process.env.ANY_DOCTOR_AGENT) candidates.push(process.env.ANY_DOCTOR_AGENT);
  candidates.push("claude", "codex", "opencode");

  for (const cand of candidates) {
    if (!cand) continue;
    const bin = cand.split(/\s+/)[0];
    const r = spawnSync("sh", ["-c", "command -v " + bin], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) {
      return { raw: cand, bin, path: r.stdout.trim() };
    }
  }
  return null;
}

export function agentArgs(agent: Agent, prompt: string): string[] {
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
