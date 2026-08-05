export type AgentWorkspaceStatus = "enabled" | "disabled" | "archived" | "degraded";
export type AgentWorkspaceBindingKind = "skill" | "mcp_server" | "yeonjang";
export type AgentWorkspaceDiagnosticCode = "agent_name_required" | "agent_name_duplicate" | "agent_binding_target_missing" | "agent_relationship_target_missing";
export interface AgentWorkspaceSource {
    agentId: string;
    agentType: "knowbee" | "sub_agent";
    status: AgentWorkspaceStatus;
    agentName: string;
    role: string;
    profileVersion: number;
    updatedAt: number;
    model: {
        configured: boolean;
        availability: "ready" | "degraded" | "unavailable" | "unknown";
        modelName?: string;
    };
}
export interface AgentWorkspaceBindingSource {
    agentId: string;
    kind: AgentWorkspaceBindingKind;
    status: "enabled" | "disabled" | "archived";
    displayName?: string;
}
export interface AgentWorkspaceRelationshipSource {
    parentAgentId: string;
    childAgentId: string;
    status: "active" | "disabled" | "archived";
}
export interface AgentWorkspaceItem {
    agentRef: string;
    name: string;
    role: string;
    status: AgentWorkspaceStatus;
    profileVersion: number;
    updatedAt: number;
    model: AgentWorkspaceSource["model"];
    parentName: string;
    directChildCount: number;
    bindingCounts: {
        skills: number;
        mcpServers: number;
        yeonjang: number;
    };
    diagnosticCodes: AgentWorkspaceDiagnosticCode[];
}
export interface AgentWorkspaceProjection {
    items: AgentWorkspaceItem[];
    details: AgentWorkspaceDetail[];
    summary: {
        total: number;
        enabled: number;
        disabled: number;
        archived: number;
        degraded: number;
        issueCount: number;
        diagnosticCodes: AgentWorkspaceDiagnosticCode[];
    };
    observedAt: number;
}
export interface AgentWorkspaceDetail extends AgentWorkspaceItem {
    bindingNames: {
        skills: string[];
        mcpServers: string[];
        yeonjang: string[];
    };
    directChildNames: string[];
}
export declare function buildAgentWorkspaceProjection(input: {
    agents: readonly AgentWorkspaceSource[];
    bindings: readonly AgentWorkspaceBindingSource[];
    relationships: readonly AgentWorkspaceRelationshipSource[];
    mainAgentName: string;
    observedAt: number;
    publicRefForAgentId(agentId: string): string;
}): AgentWorkspaceProjection;
//# sourceMappingURL=agent-workspace-projection.d.ts.map