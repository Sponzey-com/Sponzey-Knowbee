export type AgentTerminalFailureTrust = "sanitized_tool_failure" | "trusted_deterministic";
export interface AgentTerminalFailureNotice {
    kind: "agent_terminal_failure";
    toolName: string;
    failureTrust: AgentTerminalFailureTrust;
    reason: string;
    deliveryMode: "diagnostic";
    textSource: "agent_terminal_failure_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export declare function buildAgentTerminalFailureNotice(input: {
    toolName: string;
    failureTrust: AgentTerminalFailureTrust;
    reason: string;
}): AgentTerminalFailureNotice;
//# sourceMappingURL=terminal-failure-notice.d.ts.map