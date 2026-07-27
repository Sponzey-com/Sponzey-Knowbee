import type { KnowbeeConfig } from "../config/types.js";
import { type AgentHierarchyStorage } from "../orchestration/hierarchy.js";
import type { AgentRelationshipCommandPorts } from "./agent-relationship-command.js";
import { type AgentRelationshipProjection } from "./agent-relationship-projection.js";
export declare function createAgentRelationshipPublicRef(edgeId: string): string;
export declare function buildSqliteAgentRelationshipProjection(input: {
    config: KnowbeeConfig;
    observedAt?: number;
}): AgentRelationshipProjection;
export declare function createSqliteAgentRelationshipCommandPorts(input: {
    config: KnowbeeConfig;
    storage: AgentHierarchyStorage;
    now?: () => number;
}): AgentRelationshipCommandPorts;
//# sourceMappingURL=agent-relationship-repository.d.ts.map