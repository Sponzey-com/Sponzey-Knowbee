export function buildNextAttemptToolPolicy(input) {
    if (input.followupExecutionMode === "response_only") {
        return { mode: "forbidden" };
    }
    if (input.followupExecutionMode === "tool") {
        return {
            mode: "required",
            toolNames: [...new Set(input.requiredToolNames ?? [])].sort(),
        };
    }
    return { mode: "unconstrained" };
}
//# sourceMappingURL=next-attempt-tool-policy.js.map