export const AGENT_PERSONA_PROTECTED_POLICY_AXES = [
    "platform_policy",
    "safety",
    "permission",
    "memory_isolation",
    "response_language",
    "identity",
    "delegation",
];
function normalized(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
export function evaluateAgentPersonaPolicyBoundary(input) {
    const traits = normalized(input.explicitTraits);
    if (traits.length === 0)
        return { status: "inactive", reasonCode: "explicit_traits_missing" };
    const blockedAxes = [...new Set(input.overrideAttempts
            .filter((attempt) => attempt.instruction.trim().length > 0)
            .map((attempt) => attempt.axis))];
    if (blockedAxes.length > 0) {
        return { status: "blocked", reasonCode: "persona_policy_override", blockedAxes };
    }
    return { status: "applied", traits };
}
//# sourceMappingURL=agent-persona-policy-boundary.js.map