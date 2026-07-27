export type McpTransport = "stdio" | "http";
export type McpConfiguredStatus = "enabled" | "disabled";
export type McpRuntimeStatus = "ready" | "unavailable" | "inactive" | "not_loaded";
export interface McpCatalogRow {
    mcp_server_id: string;
    status: "enabled" | "disabled" | "archived";
    display_name: string;
    metadata_json: string | null;
    updated_at: number;
}
export interface McpBindingRow {
    catalog_id: string;
    status: "enabled" | "disabled" | "archived";
    updated_at?: number;
}
export interface McpRuntimeRow {
    name: string;
    transport: McpTransport;
    enabled: boolean;
    required: boolean;
    ready: boolean;
    toolCount: number;
    registeredToolCount: number;
    tools: readonly {
        name: string;
        description: string;
        registeredName?: string;
    }[];
}
export interface McpToolProjection {
    name: string;
    description: string;
}
export interface McpCatalogProjection {
    mcpRef: string;
    displayName: string;
    transport: McpTransport;
    configuredStatus: McpConfiguredStatus;
    runtimeStatus: McpRuntimeStatus;
    required: boolean;
    toolCount: number;
    bindingCount: number;
    issueCode: "mcp_inactive" | "mcp_runtime_not_loaded" | "mcp_runtime_unavailable" | "mcp_required_unavailable" | null;
    revision: number;
    tools: McpToolProjection[];
}
export interface McpCatalogQuery {
    limit?: number;
    cursor?: string;
    search?: string;
    transport?: McpTransport;
    runtimeStatus?: McpRuntimeStatus;
    boundOnly?: boolean;
}
export declare function buildMcpCatalogSnapshot(input: {
    rows: readonly McpCatalogRow[];
    bindings: readonly McpBindingRow[];
    runtimeStatuses: readonly McpRuntimeRow[];
    observedAt: number;
    publicRefForMcpId: (mcpServerId: string) => string;
}): {
    items: McpCatalogProjection[];
    revision: number;
    observedAt: number;
};
export declare function buildMcpCatalogPage(input: {
    rows: readonly McpCatalogRow[];
    bindings: readonly McpBindingRow[];
    runtimeStatuses: readonly McpRuntimeRow[];
    query: McpCatalogQuery;
    observedAt: number;
    publicRefForMcpId: (mcpServerId: string) => string;
}): {
    items: {
        mcpRef: string;
        displayName: string;
        transport: McpTransport;
        configuredStatus: McpConfiguredStatus;
        runtimeStatus: McpRuntimeStatus;
        required: boolean;
        toolCount: number;
        bindingCount: number;
        issueCode: "mcp_inactive" | "mcp_runtime_not_loaded" | "mcp_runtime_unavailable" | "mcp_required_unavailable" | null;
        revision: number;
    }[];
    nextCursor: string | null;
    revision: number;
    observedAt: number;
};
//# sourceMappingURL=mcp-catalog-query.d.ts.map