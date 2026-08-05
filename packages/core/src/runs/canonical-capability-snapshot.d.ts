import type { OrchestrationRegistrySnapshot } from "../orchestration/registry.js";
import type { AnyTool, ToolContext } from "../tools/types.js";
import type { CanonicalCapabilityBindingSnapshot, CanonicalCapabilityExclusionSnapshot } from "./canonical-plan-policy.js";
export interface CanonicalCapabilitySnapshotProjection {
    bindings: CanonicalCapabilityBindingSnapshot[];
    exclusions: CanonicalCapabilityExclusionSnapshot[];
}
export interface CapabilityRuntimeHealthObservation {
    capabilityId: string;
    targetId: string;
    status: "ready" | "unavailable";
    observedAt: number;
    expiresAt: number;
    reasonCodes: string[];
}
export interface YeonjangAgentBindingObservation {
    agentId: string;
    targetId: string;
}
export declare function projectCanonicalCapabilitySnapshot(input: {
    rootAgentId?: string;
    actionCapabilityIds: string[];
    registry: OrchestrationRegistrySnapshot;
    tools: AnyTool[];
    source?: ToolContext["source"];
    snapshotAt?: number;
    runtimeHealthObservations?: CapabilityRuntimeHealthObservation[];
    yeonjangAgentBindings?: YeonjangAgentBindingObservation[];
}): CanonicalCapabilitySnapshotProjection;
//# sourceMappingURL=canonical-capability-snapshot.d.ts.map