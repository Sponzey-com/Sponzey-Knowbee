export const UX_CHANGE_INTENTS = ["user_task", "decoration", "implementation_convenience", "feature_showcase"] as const
export const UX_RECOVERY_CAPABILITIES = ["accessibility", "input_recovery", "cancel", "undo", "error_reason", "next_action"] as const

export type UxChangeIntent = typeof UX_CHANGE_INTENTS[number]
export type UxRecoveryCapability = typeof UX_RECOVERY_CAPABILITIES[number]

export interface UxUserValueReceipt {
  changeId: string
  intent: UxChangeIntent
  userTaskId: string
  metricId: string
  improvementDirection: "higher" | "lower"
  baselineValue: number
  projectedValue: number
  evidenceRef: string
}

export interface UxCommonFlowReceipt {
  flowId: string
  frequencyEvidenceRef: string
  beforeStepCount: number
  afterStepCount: number
  stateNames: readonly string[]
  deterministicForSameInput: boolean
  evidenceRef: string
}

export interface UxRecoveryCapabilityReceipt {
  capability: UxRecoveryCapability
  status: "provided" | "not_applicable"
  evidenceRef: string
  exceptionReason?: string
  alternativeCapability?: UxRecoveryCapability
}

export interface UxRecoveryReceipt {
  flowId: string
  destructive: boolean
  capabilities: readonly UxRecoveryCapabilityReceipt[]
}

export type UxChangeAuthorizationDecision =
  | { status: "authorized"; changeId: string; flowId: string; evidenceRefs: string[] }
  | { status: "blocked"; reasonCode:
      | "user_value_invalid"
      | "non_user_intent"
      | "user_outcome_not_improved"
      | "common_flow_invalid"
      | "common_flow_regressed"
      | "common_flow_state_ambiguous"
      | "recovery_capability_missing"
      | "recovery_exception_invalid"
      | "destructive_recovery_missing"; capability?: UxRecoveryCapability }

function exact(value: string | undefined): string {
  return value?.trim() ?? ""
}

export function authorizeUxChange(input: {
  value: UxUserValueReceipt
  flow: UxCommonFlowReceipt
  recovery: UxRecoveryReceipt
}): UxChangeAuthorizationDecision {
  const value = input.value
  if (!exact(value.changeId) || !UX_CHANGE_INTENTS.includes(value.intent) || !exact(value.userTaskId)
    || !exact(value.metricId) || !Number.isFinite(value.baselineValue) || !Number.isFinite(value.projectedValue)
    || !exact(value.evidenceRef)) {
    return { status: "blocked", reasonCode: "user_value_invalid" }
  }
  if (value.intent !== "user_task") return { status: "blocked", reasonCode: "non_user_intent" }
  const improved = value.improvementDirection === "higher"
    ? value.projectedValue > value.baselineValue
    : value.projectedValue < value.baselineValue
  if (!improved) return { status: "blocked", reasonCode: "user_outcome_not_improved" }

  const flow = input.flow
  if (!exact(flow.flowId) || !exact(flow.frequencyEvidenceRef) || !exact(flow.evidenceRef)
    || !Number.isSafeInteger(flow.beforeStepCount) || !Number.isSafeInteger(flow.afterStepCount)
    || flow.beforeStepCount < 1 || flow.afterStepCount < 1 || flow.stateNames.length === 0) {
    return { status: "blocked", reasonCode: "common_flow_invalid" }
  }
  if (flow.afterStepCount > flow.beforeStepCount) return { status: "blocked", reasonCode: "common_flow_regressed" }
  const states = flow.stateNames.map(exact)
  if (states.some((state) => !state) || new Set(states).size !== states.length || !flow.deterministicForSameInput) {
    return { status: "blocked", reasonCode: "common_flow_state_ambiguous" }
  }

  if (input.recovery.flowId !== flow.flowId) return { status: "blocked", reasonCode: "common_flow_invalid" }
  const capabilities = new Map<UxRecoveryCapability, UxRecoveryCapabilityReceipt>()
  for (const receipt of input.recovery.capabilities) {
    if (!UX_RECOVERY_CAPABILITIES.includes(receipt.capability) || capabilities.has(receipt.capability) || !exact(receipt.evidenceRef)) {
      return { status: "blocked", reasonCode: "recovery_capability_missing", capability: receipt.capability }
    }
    capabilities.set(receipt.capability, receipt)
  }
  for (const capability of UX_RECOVERY_CAPABILITIES) {
    const receipt = capabilities.get(capability)
    if (!receipt) return { status: "blocked", reasonCode: "recovery_capability_missing", capability }
    if (receipt.status === "not_applicable") {
      const alternative = receipt.alternativeCapability ? capabilities.get(receipt.alternativeCapability) : undefined
      if (!exact(receipt.exceptionReason) || !alternative || alternative.status !== "provided") {
        return { status: "blocked", reasonCode: "recovery_exception_invalid", capability }
      }
    }
  }
  if (input.recovery.destructive
    && capabilities.get("cancel")?.status !== "provided"
    && capabilities.get("undo")?.status !== "provided") {
    return { status: "blocked", reasonCode: "destructive_recovery_missing" }
  }
  return {
    status: "authorized",
    changeId: value.changeId,
    flowId: flow.flowId,
    evidenceRefs: [value.evidenceRef, flow.frequencyEvidenceRef, flow.evidenceRef, ...UX_RECOVERY_CAPABILITIES.map((capability) => capabilities.get(capability)!.evidenceRef)],
  }
}

export async function publishAuthorizedUxChange<T>(input: {
  decision: UxChangeAuthorizationDecision
  publish: (authorization: Extract<UxChangeAuthorizationDecision, { status: "authorized" }>) => Promise<T>
}): Promise<{ status: "published"; result: T } | Extract<UxChangeAuthorizationDecision, { status: "blocked" }>> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "published", result: await input.publish(input.decision) }
}
