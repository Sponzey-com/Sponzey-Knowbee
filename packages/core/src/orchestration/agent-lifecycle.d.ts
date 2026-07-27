import type { AgentStatus } from "../contracts/sub-agent-orchestration.js";
export interface AgentLifecycleTransitionDecision {
    allowed: boolean;
    reasonCode: "agent_lifecycle_transition_allowed" | "archived_agent_reactivation_forbidden";
    fromStatus: AgentStatus;
    toStatus: AgentStatus;
}
export declare class AgentLifecycleTransitionError extends Error {
    readonly reasonCode = "archived_agent_reactivation_forbidden";
    readonly fromStatus: AgentStatus;
    readonly toStatus: AgentStatus;
    constructor(decision: AgentLifecycleTransitionDecision);
}
export declare function validateAgentLifecycleTransition(input: {
    fromStatus: AgentStatus;
    toStatus: AgentStatus;
}): AgentLifecycleTransitionDecision;
export declare function assertAgentLifecycleTransition(input: {
    fromStatus: AgentStatus;
    toStatus: AgentStatus;
}): void;
//# sourceMappingURL=agent-lifecycle.d.ts.map