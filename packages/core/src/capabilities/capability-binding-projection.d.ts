export interface CapabilityBindingAgentRow {
    agent_id: string;
    agent_name: string;
    status: string;
}
export interface CapabilityBindingProjectionRow {
    agent_id: string;
    catalog_id: string;
    status: string;
}
export declare function buildCapabilityBindingProjection(input: {
    catalogId: string;
    agents: readonly CapabilityBindingAgentRow[];
    bindings: readonly CapabilityBindingProjectionRow[];
    publicRefForAgentId: (agentId: string) => string;
}): {
    boundAgents: {
        agentRef: string;
        name: string;
    }[];
    availableAgents: {
        agentRef: string;
        name: string;
    }[];
};
//# sourceMappingURL=capability-binding-projection.d.ts.map