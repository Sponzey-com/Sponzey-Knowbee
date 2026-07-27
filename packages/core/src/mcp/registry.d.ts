import type { KnowbeeConfig } from "../config/types.js";
import type { McpComponentState } from "../contracts/mcp-component-state.js";
import type { CapabilityPolicy, SkillMcpAllowlist } from "../contracts/sub-agent-orchestration.js";
import { type McpServerConfig, type McpTransport } from "./client.js";
export interface McpToolStatus {
    name: string;
    registeredName: string;
    description: string;
}
export interface McpServerStatus {
    name: string;
    transport: McpTransport;
    enabled: boolean;
    required: boolean;
    connectionState: McpComponentState;
    ready: boolean;
    toolCount: number;
    registeredToolCount: number;
    command?: string;
    url?: string;
    error?: string;
    agentSessionCount?: number;
    tools: McpToolStatus[];
}
export interface McpSummary {
    serverCount: number;
    readyCount: number;
    toolCount: number;
    requiredFailures: number;
}
export type McpPrepareResult = {
    readonly status: "prepared";
    readonly statuses: McpServerStatus[];
} | {
    readonly status: "rejected";
    readonly reasonCode: "registry_not_empty";
};
export declare function filterMcpStatusesForAgentAllowlist(statuses: McpServerStatus[], input: SkillMcpAllowlist | CapabilityPolicy): McpServerStatus[];
export declare function toRegisteredToolName(serverName: string, toolName: string): string;
declare class McpRegistry {
    private readonly entries;
    private nextEntryRevision;
    private defaultCwd;
    private baseEnv;
    private createEntry;
    prepareFromConfig(config: KnowbeeConfig, baseEnv?: NodeJS.ProcessEnv): McpPrepareResult;
    loadFromConfig(config: KnowbeeConfig, baseEnv?: NodeJS.ProcessEnv): Promise<void>;
    connectConfigured(): Promise<McpServerStatus[]>;
    reloadFromConfig(config: KnowbeeConfig, baseEnv?: NodeJS.ProcessEnv): Promise<McpServerStatus[]>;
    reloadServer(name: string, config: McpServerConfig, options: {
        defaultCwd: string;
        baseEnv?: NodeJS.ProcessEnv;
    }): Promise<McpServerStatus>;
    getStatuses(): McpServerStatus[];
    getAgentScopedStatuses(input: SkillMcpAllowlist | CapabilityPolicy): McpServerStatus[];
    getSummary(): McpSummary;
    closeAll(): Promise<void>;
    private closeServer;
    private loadServer;
    private registerTools;
    private agentSessionKey;
    private getAgentClient;
    private callAgentScopedTool;
    getAgentSessionSnapshot(): Array<{
        serverName: string;
        sessionKey: string;
        agentId: string;
        bindingId?: string;
        secretScopeId: string;
    }>;
    private unregisterTools;
}
export declare const mcpRegistry: McpRegistry;
export {};
//# sourceMappingURL=registry.d.ts.map