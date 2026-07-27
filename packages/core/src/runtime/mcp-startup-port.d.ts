import type { KnowbeeConfig } from "../config/types.js";
import { type McpPrepareResult, type McpServerStatus } from "../mcp/registry.js";
export interface McpStartupPort {
    prepare(config: KnowbeeConfig, baseEnv?: Readonly<Record<string, string | undefined>>): McpPrepareResult;
    connectConfigured(): Promise<McpServerStatus[]>;
    cancel(): Promise<void>;
    close(): Promise<void>;
}
export interface McpStartupRegistryAdapter {
    prepareFromConfig(config: KnowbeeConfig, baseEnv?: NodeJS.ProcessEnv): McpPrepareResult;
    connectConfigured(): Promise<McpServerStatus[]>;
    closeAll(): Promise<void>;
}
export declare function createMcpStartupPort(registry?: McpStartupRegistryAdapter): McpStartupPort;
export type McpBackgroundConnectionResult = {
    readonly status: "completed";
    readonly statuses: McpServerStatus[];
} | {
    readonly status: "failed";
    readonly reasonCode: "mcp_connection_failed";
};
export interface McpBackgroundConnection {
    readonly status: "started";
    readonly completion: Promise<McpBackgroundConnectionResult>;
}
export declare function startMcpConnectionsInBackground(port: McpStartupPort): McpBackgroundConnection;
//# sourceMappingURL=mcp-startup-port.d.ts.map