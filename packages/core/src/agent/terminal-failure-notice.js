export function buildAgentTerminalFailureNotice(input) {
    return {
        kind: "agent_terminal_failure",
        toolName: normalizeTerminalFailureToolName(input.toolName),
        failureTrust: input.failureTrust,
        reason: normalizeTerminalFailureReason(input.reason),
        deliveryMode: "diagnostic",
        textSource: "agent_terminal_failure_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
function normalizeTerminalFailureToolName(toolName) {
    const normalized = toolName.trim();
    return normalized.length > 0 ? normalized : "unknown_tool";
}
function normalizeTerminalFailureReason(reason) {
    const normalized = reason.trim();
    return normalized.length > 0 ? normalized : "tool stopped execution after failure";
}
//# sourceMappingURL=terminal-failure-notice.js.map