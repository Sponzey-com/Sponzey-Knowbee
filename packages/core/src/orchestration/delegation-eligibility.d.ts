import type { OrchestrationTask } from "../contracts/sub-agent-orchestration.js";
import type { AgentRegistryEntry } from "./registry.js";
export type DelegationEligibilityState = "candidate_loaded" | "policy_evaluated" | "eligible" | "rejected";
export interface DelegationEligibilityDecision {
    state: "eligible" | "rejected";
    stateTrace: DelegationEligibilityState[];
    reasonCodes: string[];
}
export declare function evaluateDelegationEligibility(input: {
    task: OrchestrationTask;
    agent: AgentRegistryEntry;
}): DelegationEligibilityDecision;
//# sourceMappingURL=delegation-eligibility.d.ts.map