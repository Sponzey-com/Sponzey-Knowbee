export type AgentTerminalFailureTrust = "sanitized_tool_failure" | "trusted_deterministic"

export interface AgentTerminalFailureNotice {
  kind: "agent_terminal_failure"
  toolName: string
  failureTrust: AgentTerminalFailureTrust
  reason: string
  deliveryMode: "diagnostic"
  textSource: "agent_terminal_failure_notice"
  renderingRequired: "llm_final_response"
  finalAnswer: false
  assistantIdentityClaim: false
}

export function buildAgentTerminalFailureNotice(input: {
  toolName: string
  failureTrust: AgentTerminalFailureTrust
  reason: string
}): AgentTerminalFailureNotice {
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
  }
}

function normalizeTerminalFailureToolName(toolName: string): string {
  const normalized = toolName.trim()
  return normalized.length > 0 ? normalized : "unknown_tool"
}

function normalizeTerminalFailureReason(reason: string): string {
  const normalized = reason.trim()
  return normalized.length > 0 ? normalized : "tool stopped execution after failure"
}
