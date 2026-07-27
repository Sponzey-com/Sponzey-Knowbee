import type { SafetyRiskDecision } from "../contracts/safety-control-self-solve.js"

export type AppliedSafetyRiskDecision<T> =
  | { status: "executed"; result: T }
  | { status: "blocked_pending_input"; requiredActions: string[] }
  | { status: "stopped"; reasonCode: "safety_risk"; evidenceRefs: string[] }

export async function applySafetyRiskDecision<T>(input: {
  decision: SafetyRiskDecision
  execute: () => Promise<T>
  requestMitigationOrApproval: (requiredActions: string[]) => void | Promise<void>
  stopRun: (input: { reasonCode: "safety_risk"; evidenceRefs: string[] }) => void | Promise<void>
}): Promise<AppliedSafetyRiskDecision<T>> {
  if (input.decision.status === "continue") return { status: "executed", result: await input.execute() }
  if (input.decision.status === "blocked_pending_input") {
    await input.requestMitigationOrApproval(input.decision.requiredActions)
    return { status: "blocked_pending_input", requiredActions: input.decision.requiredActions }
  }
  await input.stopRun({ reasonCode: "safety_risk", evidenceRefs: input.decision.evidenceRefs })
  return { status: "stopped", reasonCode: "safety_risk", evidenceRefs: input.decision.evidenceRefs }
}
