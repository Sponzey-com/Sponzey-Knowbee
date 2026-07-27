import {
  validateYeonjangIdentityBoundarySnapshot,
  type YeonjangIdentityBoundarySnapshot,
} from "./yeonjang-identity-boundary.js"

export type RequestedStepExecutionKind = "knowbee_only" | "yeonjang_required"

export interface RequestedCapabilityStep {
  stepId: string
  summary: string
  executionKind: RequestedStepExecutionKind
  requiredCapability?: string
  requiredCapabilityName?: string
  userFacingReason?: string
  userNextAction?: string
}

export interface NoYeonjangCapabilityGapDecision {
  schemaVersion: 1
  outcome: "self_solve" | "partial_self_solve" | "guidance_required"
  selfSolveSteps: Array<{ stepId: string; summary: string }>
  blockedSteps: Array<{
    stepId: string
    summary: string
    status: "not_executed"
    requiredCapability: string
    requiredCapabilityName: string
    reasonCode: "no_runnable_yeonjang_capability"
    userFacingReason: string
    userNextAction: string
  }>
}

export interface TruthfulNoYeonjangResult {
  schemaVersion: 1
  status: "completed" | "partial" | "blocked"
  completedSelfSolveResults: Array<{ stepId: string; result: string }>
  blockedSteps: NoYeonjangCapabilityGapDecision["blockedSteps"]
}

function required(value: string | undefined, field: string): string {
  const normalized = value?.trim() ?? ""
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function assertUnique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${field} values must be unique.`)
}

export function decideNoYeonjangCapabilityGap(input: {
  steps: RequestedCapabilityStep[]
  snapshot: YeonjangIdentityBoundarySnapshot
  maxAgeMs: number
}): NoYeonjangCapabilityGapDecision {
  if (input.steps.length === 0) throw new Error("Capability-gap decision requires at least one request step.")
  const snapshot = validateYeonjangIdentityBoundarySnapshot({ snapshot: input.snapshot, maxAgeMs: input.maxAgeMs })
  const stepIds = input.steps.map((step) => required(step.stepId, "Request step ID"))
  assertUnique(stepIds, "Request step ID")
  const selfSolveSteps: NoYeonjangCapabilityGapDecision["selfSolveSteps"] = []
  const blockedSteps: NoYeonjangCapabilityGapDecision["blockedSteps"] = []

  for (const step of input.steps) {
    const summary = required(step.summary, "Request step summary")
    if (step.executionKind === "knowbee_only") {
      if (step.requiredCapability?.trim()) throw new Error("Knowbee-only steps cannot require a Yeonjang capability.")
      selfSolveSteps.push({ stepId: step.stepId, summary })
      continue
    }
    const requiredCapability = required(step.requiredCapability, "Required Yeonjang capability")
    const runnable = snapshot.instances.some((instance) =>
      instance.connectionState === "online"
      && instance.trustState === "trusted"
      && instance.capabilityIds.includes(requiredCapability),
    )
    if (runnable) throw new Error(`No-Yeonjang fallback cannot block an available capability: ${requiredCapability}.`)
    blockedSteps.push({
      stepId: step.stepId,
      summary,
      status: "not_executed",
      requiredCapability,
      requiredCapabilityName: required(step.requiredCapabilityName, "Required Yeonjang capability name"),
      reasonCode: "no_runnable_yeonjang_capability",
      userFacingReason: required(step.userFacingReason, "Blocked step user-facing reason"),
      userNextAction: required(step.userNextAction, "Blocked step user next action"),
    })
  }
  const outcome = blockedSteps.length === 0
    ? "self_solve"
    : selfSolveSteps.length > 0
      ? "partial_self_solve"
      : "guidance_required"
  return { schemaVersion: 1, outcome, selfSolveSteps, blockedSteps }
}

export function buildTruthfulNoYeonjangResult(input: {
  decision: NoYeonjangCapabilityGapDecision
  selfSolveResults: Array<{ stepId: string; result: string }>
}): TruthfulNoYeonjangResult {
  assertUnique(input.selfSolveResults.map((item) => required(item.stepId, "Self-solve result step ID")), "Self-solve result step ID")
  const expected = new Set(input.decision.selfSolveSteps.map((step) => step.stepId))
  const completed = input.selfSolveResults.map((item) => {
    if (!expected.delete(item.stepId)) throw new Error(`Self-solve result does not match a self-solve step: ${item.stepId}.`)
    return { stepId: item.stepId, result: required(item.result, "Self-solve result") }
  })
  if (expected.size > 0) throw new Error(`Self-solve results are missing: ${[...expected].join(", ")}.`)
  if (input.decision.blockedSteps.some((step) => step.status !== "not_executed")) {
    throw new Error("Blocked computer actions must remain not_executed without a Yeonjang execution receipt.")
  }
  return {
    schemaVersion: 1,
    status: input.decision.blockedSteps.length === 0 ? "completed" : completed.length > 0 ? "partial" : "blocked",
    completedSelfSolveResults: completed,
    blockedSteps: structuredClone(input.decision.blockedSteps),
  }
}
