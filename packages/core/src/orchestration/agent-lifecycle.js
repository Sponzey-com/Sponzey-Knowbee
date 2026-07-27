export class AgentLifecycleTransitionError extends Error {
    reasonCode = "archived_agent_reactivation_forbidden";
    fromStatus;
    toStatus;
    constructor(decision) {
        super(`Agent lifecycle transition ${decision.fromStatus} -> ${decision.toStatus} is forbidden.`);
        this.name = "AgentLifecycleTransitionError";
        this.fromStatus = decision.fromStatus;
        this.toStatus = decision.toStatus;
    }
}
export function validateAgentLifecycleTransition(input) {
    const allowed = input.fromStatus !== "archived" || input.toStatus === "archived";
    return {
        allowed,
        reasonCode: allowed
            ? "agent_lifecycle_transition_allowed"
            : "archived_agent_reactivation_forbidden",
        ...input,
    };
}
export function assertAgentLifecycleTransition(input) {
    const decision = validateAgentLifecycleTransition(input);
    if (!decision.allowed)
        throw new AgentLifecycleTransitionError(decision);
}
//# sourceMappingURL=agent-lifecycle.js.map