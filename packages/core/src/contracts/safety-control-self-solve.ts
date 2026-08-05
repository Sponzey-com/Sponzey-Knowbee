export type SafetySeverity = "low" | "medium" | "high" | "critical"

export interface SafetyRiskReceipt {
  riskKind: string
  severity: SafetySeverity
  affectedActionRef: string
  evidenceRefs: string[]
  mitigationAvailable: boolean
  approvalEligible: boolean
  requiredMitigations: string[]
}

export type SafetyRiskDecision =
  | { status: "continue"; reasonCode: "risk_below_stop_threshold" }
  | { status: "blocked_pending_input"; reasonCode: "mitigation_or_approval_required"; requiredActions: string[] }
  | { status: "stop_and_report"; reasonCode: "safety_risk"; evidenceRefs: string[] }

export interface UserExecutionControlReceipt {
  commandId: string
  command: "cancel" | "redirect"
  targetRunId: string
  currentRunId: string
  actorRef: string
  sequence: number
  lastAppliedSequence: number
  newGoalRef?: string
}

export type UserExecutionControlDecision =
  | { status: "ignored"; reasonCode: "wrong_target" | "stale_or_duplicate" }
  | { status: "cancelled"; reasonCode: "user_cancelled"; commandId: string }
  | { status: "redirected"; reasonCode: "user_redirected"; commandId: string; newGoalRef: string }

export interface SelfSolvePathReceipt {
  path: "direct_answer" | "plan"
  outcome: "available" | "attempted_failed" | "reviewed_unavailable"
  reasonCode: string
  evidenceRefs: string[]
}

export type SelfSolveBeforeStopDecision =
  | { status: "continue"; reasonCode: "self_solve_available"; path: SelfSolvePathReceipt["path"] }
  | { status: "eligible_for_exhaustion"; reasonCode: "self_solve_exhausted"; evidenceRefs: string[] }

function required(value: string | undefined, field: string): string {
  const normalized = value?.trim() ?? ""
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function unique(values: readonly string[], field: string): string[] {
  const normalized = values.map((value) => required(value, field))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${field} values must be unique.`)
  return normalized
}

function sequence(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer.`)
  return value
}

export function evaluateSafetyRisk(receipt: SafetyRiskReceipt): SafetyRiskDecision {
  required(receipt.riskKind, "Risk kind")
  required(receipt.affectedActionRef, "Affected action reference")
  const evidenceRefs = unique(receipt.evidenceRefs, "Safety evidence reference")
  if (evidenceRefs.length === 0) throw new Error("Safety risk requires evidence.")
  const requiredActions = unique(receipt.requiredMitigations, "Required mitigation")
  if (receipt.severity === "low" || receipt.severity === "medium") {
    return { status: "continue", reasonCode: "risk_below_stop_threshold" }
  }
  if (receipt.mitigationAvailable || receipt.approvalEligible) {
    if (requiredActions.length === 0) throw new Error("Mitigable or approvable safety risk requires an action.")
    return { status: "blocked_pending_input", reasonCode: "mitigation_or_approval_required", requiredActions }
  }
  return { status: "stop_and_report", reasonCode: "safety_risk", evidenceRefs }
}

export function evaluateUserExecutionControl(receipt: UserExecutionControlReceipt): UserExecutionControlDecision {
  const commandId = required(receipt.commandId, "Command ID")
  const targetRunId = required(receipt.targetRunId, "Target run ID")
  const currentRunId = required(receipt.currentRunId, "Current run ID")
  required(receipt.actorRef, "Control actor reference")
  const currentSequence = sequence(receipt.sequence, "Control command sequence")
  const lastAppliedSequence = sequence(receipt.lastAppliedSequence, "Last applied control sequence")
  if (targetRunId !== currentRunId) return { status: "ignored", reasonCode: "wrong_target" }
  if (currentSequence <= lastAppliedSequence) return { status: "ignored", reasonCode: "stale_or_duplicate" }
  if (receipt.command === "cancel") return { status: "cancelled", reasonCode: "user_cancelled", commandId }
  return {
    status: "redirected",
    reasonCode: "user_redirected",
    commandId,
    newGoalRef: required(receipt.newGoalRef, "Redirect goal reference"),
  }
}

export function evaluateSelfSolveBeforeStop(reviews: readonly SelfSolvePathReceipt[]): SelfSolveBeforeStopDecision {
  const byPath = new Map<SelfSolvePathReceipt["path"], SelfSolvePathReceipt>()
  for (const review of reviews) {
    if (byPath.has(review.path)) throw new Error(`Duplicate self-solve path review: ${review.path}.`)
    required(review.reasonCode, `Self-solve reason for ${review.path}`)
    const evidenceRefs = unique(review.evidenceRefs, `Self-solve evidence for ${review.path}`)
    if (evidenceRefs.length === 0) throw new Error(`Self-solve path requires evidence: ${review.path}.`)
    byPath.set(review.path, { ...review, evidenceRefs })
  }
  for (const path of ["direct_answer", "plan"] as const) {
    if (!byPath.has(path)) throw new Error(`Self-solve path was not reviewed: ${path}.`)
  }
  for (const path of ["direct_answer", "plan"] as const) {
    if (byPath.get(path)?.outcome === "available") return { status: "continue", reasonCode: "self_solve_available", path }
  }
  return {
    status: "eligible_for_exhaustion",
    reasonCode: "self_solve_exhausted",
    evidenceRefs: unique([...byPath.values()].flatMap((review) => review.evidenceRefs), "Self-solve exhaustion evidence"),
  }
}

export async function executeAfterControlDecision<T>(input: {
  decision: SafetyRiskDecision | UserExecutionControlDecision | SelfSolveBeforeStopDecision
  execute: () => Promise<T>
}): Promise<{ status: "executed"; result: T } | Exclude<typeof input.decision, { status: "continue" }>> {
  if (input.decision.status === "continue") return { status: "executed", result: await input.execute() }
  return input.decision as Exclude<typeof input.decision, { status: "continue" }>
}
