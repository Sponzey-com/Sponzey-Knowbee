export type AgentCapabilityKind = "skill" | "mcp_server" | "yeonjang";
export type AgentCapabilityCatalogStatus = "enabled" | "disabled" | "archived";
export type AgentCapabilityRuntimeStatus = "ready" | "degraded" | "unavailable" | "unknown";
export type AgentCapabilityBindingReasonCode = "capability_catalog_inactive" | "capability_catalog_archived" | "capability_runtime_unavailable" | "capability_binding_orphaned";
export interface AgentCapabilityCatalogSource {
    internalId: string;
    kind: AgentCapabilityKind;
    displayName: string;
    catalogStatus: AgentCapabilityCatalogStatus;
    runtimeStatus: AgentCapabilityRuntimeStatus;
    revision: number;
}
export interface AgentCapabilityBindingSource {
    agentId: string;
    kind: AgentCapabilityKind;
    catalogId: string;
    status: AgentCapabilityCatalogStatus;
    revision: number;
}
export interface AgentCapabilityBindingItem {
    capabilityRef: string;
    kind: AgentCapabilityKind;
    displayName: string;
    catalogStatus: AgentCapabilityCatalogStatus;
    runtimeStatus: AgentCapabilityRuntimeStatus;
    bound: boolean;
    editable: boolean;
    revision: number;
    reasonCodes: AgentCapabilityBindingReasonCode[];
}
export interface AgentCapabilityBindingProjection {
    agentRef: string;
    items: AgentCapabilityBindingItem[];
    orphanReasonCodes: AgentCapabilityBindingReasonCode[];
    revisions: Record<AgentCapabilityKind, number>;
    observedAt: number;
}
export declare function buildAgentCapabilityBindingProjection(input: {
    agentId: string;
    agentRef: string;
    catalog: readonly AgentCapabilityCatalogSource[];
    bindings: readonly AgentCapabilityBindingSource[];
    observedAt: number;
    publicRefForCapability(kind: AgentCapabilityKind, internalId: string): string;
}): AgentCapabilityBindingProjection;
export declare function queryAgentCapabilityBindings(projection: AgentCapabilityBindingProjection, input?: {
    search?: string;
    kind?: AgentCapabilityKind;
    limit?: number;
}): AgentCapabilityBindingProjection;
//# sourceMappingURL=agent-capability-binding-projection.d.ts.map