export declare const AGENT_PERSONA_PROTECTED_POLICY_AXES: readonly ["platform_policy", "safety", "permission", "memory_isolation", "response_language", "identity", "delegation"];
export type AgentPersonaProtectedPolicyAxis = typeof AGENT_PERSONA_PROTECTED_POLICY_AXES[number];
export interface AgentPersonaPolicyOverrideAttempt {
    axis: AgentPersonaProtectedPolicyAxis;
    instruction: string;
}
export type AgentPersonaPolicyBoundaryDecision = {
    status: "inactive";
    reasonCode: "explicit_traits_missing";
} | {
    status: "applied";
    traits: string[];
} | {
    status: "blocked";
    reasonCode: "persona_policy_override";
    blockedAxes: AgentPersonaProtectedPolicyAxis[];
};
export declare function evaluateAgentPersonaPolicyBoundary(input: {
    explicitTraits: string[];
    overrideAttempts: AgentPersonaPolicyOverrideAttempt[];
}): AgentPersonaPolicyBoundaryDecision;
//# sourceMappingURL=agent-persona-policy-boundary.d.ts.map