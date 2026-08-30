export interface Agent {
    raw: string;
    bin: string;
    path: string;
}
export declare function resolveAgent(explicit?: string): Agent | null;
export declare function agentArgs(agent: Agent, prompt: string): string[];
