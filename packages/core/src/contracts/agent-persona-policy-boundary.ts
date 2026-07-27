export const AGENT_PERSONA_PROTECTED_POLICY_AXES = [
  "platform_policy",
  "safety",
  "permission",
  "memory_isolation",
  "response_language",
  "identity",
  "delegation",
] as const

export type AgentPersonaProtectedPolicyAxis = typeof AGENT_PERSONA_PROTECTED_POLICY_AXES[number]

export interface AgentPersonaPolicyOverrideAttempt {
  axis: AgentPersonaProtectedPolicyAxis
  instruction: string
}

export type AgentPersonaPolicyBoundaryDecision =
  | { status: "inactive"; reasonCode: "explicit_traits_missing" }
  | { status: "applied"; traits: string[] }
  | {
      status: "blocked"
      reasonCode: "persona_policy_override"
      blockedAxes: AgentPersonaProtectedPolicyAxis[]
    }

function normalized(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function evaluateAgentPersonaPolicyBoundary(input: {
  explicitTraits: string[]
  overrideAttempts: AgentPersonaPolicyOverrideAttempt[]
}): AgentPersonaPolicyBoundaryDecision {
  const traits = normalized(input.explicitTraits)
  if (traits.length === 0) return { status: "inactive", reasonCode: "explicit_traits_missing" }
  const blockedAxes = [...new Set(input.overrideAttempts
    .filter((attempt) => attempt.instruction.trim().length > 0)
    .map((attempt) => attempt.axis))]
  if (blockedAxes.length > 0) {
    return { status: "blocked", reasonCode: "persona_policy_override", blockedAxes }
  }
  return { status: "applied", traits }
}
