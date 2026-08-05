export type McpToolAgentAccessStatus = "allowed" | "disabled" | "not_bound";
export interface McpToolAccessAgentRow {
    agent_id: string;
    agent_name: string;
    status: string;
}
export interface McpToolAccessBindingRow {
    agent_id: string;
    catalog_id: string;
    status: string;
    enabled_tool_names: readonly string[];
    disabled_tool_names: readonly string[];
}
export interface McpToolAccessRuntimeRow {
    name: string;
    registeredName?: string;
    description: string;
}
export declare function buildMcpToolAccessProjection(input: {
    catalogId: string;
    serverName: string;
    tools: readonly McpToolAccessRuntimeRow[];
    agents: readonly McpToolAccessAgentRow[];
    bindings: readonly McpToolAccessBindingRow[];
    publicRefForAgentId(agentId: string): string;
}): {
    tools: {
        name: string;
        description: string;
        access: {
            agentRef: string;
            agentName: string;
            status: McpToolAgentAccessStatus;
        }[];
    }[];
};
//# sourceMappingURL=mcp-tool-access-projection.d.ts.map