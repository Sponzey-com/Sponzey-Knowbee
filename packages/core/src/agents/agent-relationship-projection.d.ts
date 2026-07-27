export interface AgentRelationshipProjectionSource {
    internalEdgeId: string;
    parentAgentId: string;
    parentName: string;
    childAgentId: string;
    childName: string;
    status: "active" | "disabled" | "archived";
    sortOrder: number;
    revision: number;
}
export interface AgentRelationshipProjectionItem {
    relationshipRef: string;
    parentRef: string;
    parentName: string;
    childRef: string;
    childName: string;
    depth: number;
    sortOrder: number;
}
export interface AgentRelationshipProjection {
    root: {
        agentRef: string;
        name: string;
    };
    relationships: AgentRelationshipProjectionItem[];
    revision: number;
    observedAt: number;
}
export declare function buildAgentRelationshipProjection(input: {
    rootAgentId: string;
    rootName: string;
    relationships: readonly AgentRelationshipProjectionSource[];
    observedAt: number;
    publicRefForAgent(internalAgentId: string): string;
    publicRefForRelationship(internalEdgeId: string): string;
}): AgentRelationshipProjection;
export declare function queryAgentRelationshipProjection(projection: AgentRelationshipProjection, input?: {
    limit?: number;
}): AgentRelationshipProjection;
//# sourceMappingURL=agent-relationship-projection.d.ts.map