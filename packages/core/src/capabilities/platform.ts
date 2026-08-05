import type { FeatureCapability } from "../contracts/feature-capability.js"

export interface PlatformCapabilityRuntime {
  providerConfigured: boolean
  conversationPortAvailable: boolean
  planningPortAvailable: boolean
  executionPortAvailable: boolean
  hierarchyPortAvailable: boolean
  activeSubAgentCount: number
}

type LlmCapabilityKey = "platform.conversation" | "platform.planning" | "platform.execution"

function projectLlmCapability(input: {
  key: LlmCapabilityKey
  label: string
  area: FeatureCapability["area"]
  portAvailable: boolean
  runtime: PlatformCapabilityRuntime
}): FeatureCapability {
  if (!input.portAvailable) {
    return {
      key: input.key,
      label: input.label,
      area: input.area,
      status: "error",
      implemented: true,
      enabled: false,
      reasonCode: "runtime_port_unavailable",
      reason: "The required runtime port is unavailable.",
    }
  }
  if (!input.runtime.providerConfigured) {
    return {
      key: input.key,
      label: input.label,
      area: input.area,
      status: "disabled",
      implemented: true,
      enabled: false,
      reasonCode: "ai_provider_not_configured",
      reason: "An AI provider must be configured before this capability can run.",
    }
  }
  return {
    key: input.key,
    label: input.label,
    area: input.area,
    status: "ready",
    implemented: true,
    enabled: true,
  }
}

function projectDelegationCapability(runtime: PlatformCapabilityRuntime): FeatureCapability {
  if (!runtime.hierarchyPortAvailable) {
    return {
      key: "agents.delegation",
      label: "Sub-agent Delegation",
      area: "gateway",
      status: "error",
      implemented: true,
      enabled: false,
      reasonCode: "hierarchy_port_unavailable",
      reason: "The agent hierarchy runtime port is unavailable.",
    }
  }
  if (runtime.activeSubAgentCount < 1) {
    return {
      key: "agents.delegation",
      label: "Sub-agent Delegation",
      area: "gateway",
      status: "disabled",
      implemented: true,
      enabled: false,
      reasonCode: "active_sub_agent_required",
      reason: "At least one active sub-agent is required for delegation.",
    }
  }
  return {
    key: "agents.delegation",
    label: "Sub-agent Delegation",
    area: "gateway",
    status: "ready",
    implemented: true,
    enabled: true,
    metadata: { activeSubAgentCount: runtime.activeSubAgentCount },
  }
}

export function projectPlatformCapabilities(
  runtime: PlatformCapabilityRuntime,
): FeatureCapability[] {
  return [
    projectLlmCapability({
      key: "platform.conversation",
      label: "Conversation and Questions",
      area: "chat",
      portAvailable: runtime.conversationPortAvailable,
      runtime,
    }),
    projectLlmCapability({
      key: "platform.planning",
      label: "Planning",
      area: "gateway",
      portAvailable: runtime.planningPortAvailable,
      runtime,
    }),
    projectLlmCapability({
      key: "platform.execution",
      label: "Task Execution",
      area: "runs",
      portAvailable: runtime.executionPortAvailable,
      runtime,
    }),
    projectDelegationCapability(runtime),
  ]
}
