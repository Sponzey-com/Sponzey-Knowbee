import type { AgentStatus } from "../contracts/sub-agent-orchestration.js"

export interface AgentLifecycleTransitionDecision {
  allowed: boolean
  reasonCode: "agent_lifecycle_transition_allowed" | "archived_agent_reactivation_forbidden"
  fromStatus: AgentStatus
  toStatus: AgentStatus
}

export class AgentLifecycleTransitionError extends Error {
  readonly reasonCode = "archived_agent_reactivation_forbidden"
  readonly fromStatus: AgentStatus
  readonly toStatus: AgentStatus

  constructor(decision: AgentLifecycleTransitionDecision) {
    super(`Agent lifecycle transition ${decision.fromStatus} -> ${decision.toStatus} is forbidden.`)
    this.name = "AgentLifecycleTransitionError"
    this.fromStatus = decision.fromStatus
    this.toStatus = decision.toStatus
  }
}

export function validateAgentLifecycleTransition(input: {
  fromStatus: AgentStatus
  toStatus: AgentStatus
}): AgentLifecycleTransitionDecision {
  const allowed = input.fromStatus !== "archived" || input.toStatus === "archived"
  return {
    allowed,
    reasonCode: allowed
      ? "agent_lifecycle_transition_allowed"
      : "archived_agent_reactivation_forbidden",
    ...input,
  }
}

export function assertAgentLifecycleTransition(input: {
  fromStatus: AgentStatus
  toStatus: AgentStatus
}): void {
  const decision = validateAgentLifecycleTransition(input)
  if (!decision.allowed) throw new AgentLifecycleTransitionError(decision)
}
