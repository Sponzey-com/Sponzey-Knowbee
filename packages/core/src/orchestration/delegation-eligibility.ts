import type { OrchestrationTask } from "../contracts/sub-agent-orchestration.js"
import type { AgentRegistryEntry } from "./registry.js"

export type DelegationEligibilityState =
  | "candidate_loaded"
  | "policy_evaluated"
  | "eligible"
  | "rejected"

export interface DelegationEligibilityDecision {
  state: "eligible" | "rejected"
  stateTrace: DelegationEligibilityState[]
  reasonCodes: string[]
}

const PERMISSION_CAPABILITIES = {
  external_network: "allowExternalNetwork",
  filesystem_write: "allowFilesystemWrite",
  shell_execution: "allowShellExecution",
  screen_control: "allowScreenControl",
} as const

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function memoryPolicyIsIsolated(agent: AgentRegistryEntry): boolean {
  const policy = agent.config.memoryPolicy
  const owns = (scope: { ownerType: string; ownerId: string }): boolean =>
    scope.ownerType === "sub_agent" && scope.ownerId === agent.agentId
  return owns(policy.owner) && owns(policy.writeScope) && policy.readScopes.every(owns)
}

function availableCapabilities(agent: AgentRegistryEntry): Set<string> {
  const permission = agent.permissionProfile
  return new Set(unique([
    agent.role,
    ...agent.specialtyTags,
    ...agent.capabilitySummary.enabledSkillIds,
    ...agent.capabilitySummary.enabledMcpServerIds,
    ...agent.capabilitySummary.enabledToolNames,
    permission.allowExternalNetwork ? "external_network" : "",
    permission.allowFilesystemWrite ? "filesystem_write" : "",
    permission.allowShellExecution ? "shell_execution" : "",
    permission.allowScreenControl ? "screen_control" : "",
  ]))
}

export function evaluateDelegationEligibility(input: {
  task: OrchestrationTask
  agent: AgentRegistryEntry
}): DelegationEligibilityDecision {
  const reasons: string[] = []
  const { agent, task } = input

  if (agent.status !== "enabled") reasons.push("agent_disabled")
  if (!agent.delegationEnabled) reasons.push("delegation_disabled")
  if (!memoryPolicyIsIsolated(agent)) reasons.push("memory_scope_violation")

  const available = availableCapabilities(agent)
  for (const required of unique(task.requiredCapabilities)) {
    if (available.has(required)) continue
    if (required in PERMISSION_CAPABILITIES) reasons.push("permission_required")
    else reasons.push("capability_denied")
  }

  if (reasons.length > 0) {
    return {
      state: "rejected",
      stateTrace: ["candidate_loaded", "policy_evaluated", "rejected"],
      reasonCodes: unique(reasons),
    }
  }
  return {
    state: "eligible",
    stateTrace: ["candidate_loaded", "policy_evaluated", "eligible"],
    reasonCodes: ["delegation_policy_satisfied"],
  }
}
