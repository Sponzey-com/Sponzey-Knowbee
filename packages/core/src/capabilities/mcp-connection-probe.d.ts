import { type McpConnectionDraft } from "./mcp-connection-validation.js";
export interface McpConnectionProbePort {
    now(): number;
    probe(input: McpConnectionDraft, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
        tools: readonly {
            name: string;
            description: string;
        }[];
    }>;
}
export interface McpConnectionProbeReceipt {
    state: "ready" | "rejected" | "failed" | "cancelled";
    ready: boolean;
    reasonCode: string | null;
    tools: Array<{
        name: string;
        description: string;
    }>;
    observedAt: number;
}
export declare function probeMcpConnectionDraft(input: unknown, ports: McpConnectionProbePort, signal?: AbortSignal): Promise<McpConnectionProbeReceipt>;
//# sourceMappingURL=mcp-connection-probe.d.ts.map