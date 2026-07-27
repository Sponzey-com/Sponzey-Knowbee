import type { FastifyInstance } from "fastify";
import type { MutationEnvelope } from "../../capabilities/capability-security-boundary.js";
import { type McpBindingUserReceipt } from "../../capabilities/mcp-binding-command.js";
import { type McpBindingRow, type McpCatalogRow, type McpRuntimeRow } from "../../capabilities/mcp-catalog-query.js";
import { type McpConnectionProbeReceipt } from "../../capabilities/mcp-connection-probe.js";
import type { McpMutationRuntime } from "../../capabilities/mcp-mutation-runtime.js";
export interface McpCatalogRepository {
    listCatalog(): readonly McpCatalogRow[];
    listBindings(): readonly McpBindingRow[];
}
export interface McpRuntimeRepository {
    listStatuses(): readonly McpRuntimeRow[];
}
export interface McpBindingProjectionRepository {
    listAgents(): readonly {
        agent_id: string;
        agent_name: string;
        status: string;
    }[];
    listBindings(): readonly {
        agent_id: string;
        catalog_id: string;
        status: string;
        enabled_tool_names_json?: string;
        disabled_tool_names_json?: string;
    }[];
}
export interface McpRouteOptions {
    catalogRepository?: McpCatalogRepository;
    runtimeRepository?: McpRuntimeRepository;
    publicRefForMcpId?: (mcpServerId: string) => string;
    publicRefForAgentId?: (agentId: string) => string;
    bindingProjectionRepository?: McpBindingProjectionRepository;
    now?: () => number;
    probeActorForRequest?: (request: unknown) => string | null;
    runtimeWorkspaceForRequest?: (request: unknown) => string;
    mcpProcessEnv?: Readonly<Record<string, string | undefined>>;
    mutationRuntime?: McpMutationRuntime;
    mutationActorForRequest?: (request: unknown) => string | null;
    bindingExecutor?: (input: {
        envelope: MutationEnvelope;
        mcpRef: string;
        agentRef: string;
        action: "bind" | "unbind";
    }) => Promise<McpBindingUserReceipt>;
    probeExecutor?: (input: {
        actorRef: string;
        draft: unknown;
        defaultCwd: string;
        signal: AbortSignal;
    }) => Promise<McpConnectionProbeReceipt>;
}
export declare function registerMcpRoute(app: FastifyInstance, options?: McpRouteOptions): void;
//# sourceMappingURL=mcp.d.ts.map