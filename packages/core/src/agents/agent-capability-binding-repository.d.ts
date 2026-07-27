import type { MutationEnvelope } from "../capabilities/capability-security-boundary.js";
import type { AgentCapabilityBindingCommandPorts } from "./agent-capability-binding-command.js";
import type { AgentCapabilityBindingSource, AgentCapabilityCatalogSource, AgentCapabilityKind } from "./agent-capability-binding-projection.js";
export declare function listAgentCapabilityCatalogSources(now?: number): AgentCapabilityCatalogSource[];
export declare function listAgentCapabilityBindingSources(): AgentCapabilityBindingSource[];
export declare function resolveInternalAgentId(agentRef: string): string | null;
export declare function createSqliteAgentCapabilityBindingCommandPorts(input?: {
    now?: () => number;
}): AgentCapabilityBindingCommandPorts;
export declare function capabilityPublicRef(kind: AgentCapabilityKind, internalId: string): string;
export type { MutationEnvelope };
//# sourceMappingURL=agent-capability-binding-repository.d.ts.map