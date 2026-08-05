import type { McpServerConfig } from "./client.js";
import { type McpAgentCallContext, type McpDiscoveredTool, type McpToolCallResult } from "./client.js";
export declare class McpHttpClient {
    private readonly config;
    private readonly onExit;
    private client;
    private transport;
    private closing;
    constructor(options: {
        config: McpServerConfig;
        onExit?: (error: string) => void;
    });
    initialize(signal?: AbortSignal): Promise<void>;
    listTools(signal?: AbortSignal): Promise<McpDiscoveredTool[]>;
    callTool(name: string, args: Record<string, unknown>, contextOrSignal?: McpAgentCallContext | AbortSignal, signal?: AbortSignal): Promise<McpToolCallResult>;
    close(): Promise<void>;
    private requireClient;
    private startupTimeoutMs;
    private toolTimeoutMs;
}
//# sourceMappingURL=http-client.d.ts.map