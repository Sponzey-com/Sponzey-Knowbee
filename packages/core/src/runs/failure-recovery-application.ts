import type {
  RecoveryCandidate,
  StructuredFailureRecoveryDecision,
} from "../contracts/index.js"

export type AppliedFailureRecovery<T> =
  | {
      status: "recovery_executed"
      outcome: "retry" | "redelegate"
      receiptId: string
      attemptSignature: string
      retryCount: number
      result: T
    }
  | {
      status: "partial_reported"
      receiptId: string
      result: T
    }
  | {
      status: "recovery_stopped"
      outcome: "completed" | "blocked"
      receiptId: string
      result: T
    }

export async function applyStructuredFailureRecoveryDecision<T>(input: {
  decision: StructuredFailureRecoveryDecision
  retryCount: number
  executeRecovery: (input: {
    action: RecoveryCandidate
    attemptSignature: string
    receiptId: string
    retryCount: number
  }) => Promise<T>
  reportPartial: (input: {
    partialResultRefs: string[]
    unresolvedScope: string[]
    nextActions: string[]
    receiptId: string
  }) => Promise<T>
  stopRecovery: (input: {
    outcome: "completed" | "blocked"
    stopCondition: NonNullable<StructuredFailureRecoveryDecision["stopCondition"]>
    reason: string
    evidenceRefs: string[]
    partialResultRefs: string[]
    unresolvedScope: string[]
    userActions: string[]
    receiptId: string
  }) => Promise<T>
}): Promise<AppliedFailureRecovery<T>> {
  if (!Number.isInteger(input.retryCount) || input.retryCount < 0) {
    throw new Error("Failure recovery retry count must be a non-negative integer.")
  }
  const decision = input.decision
  if (decision.state === "retry_ready") {
    if (!decision.selectedCandidate || !decision.nextAttemptSignature) {
      throw new Error("A retry-ready recovery decision requires an action and attempt signature.")
    }
    const retryCount = input.retryCount + 1
    const result = await input.executeRecovery({
      action: structuredClone(decision.selectedCandidate),
      attemptSignature: decision.nextAttemptSignature,
      receiptId: decision.receiptId,
      retryCount,
    })
    return {
      status: "recovery_executed",
      outcome: decision.outcome as "retry" | "redelegate",
      receiptId: decision.receiptId,
      attemptSignature: decision.nextAttemptSignature,
      retryCount,
      result,
    }
  }
  if (decision.state === "report_ready") {
    const result = await input.reportPartial({
      partialResultRefs: [...decision.partialResultRefs],
      unresolvedScope: [...decision.unresolvedScope],
      nextActions: [...decision.userActions],
      receiptId: decision.receiptId,
    })
    return { status: "partial_reported", receiptId: decision.receiptId, result }
  }
  if (!decision.stopCondition || !decision.reason) {
    throw new Error("A stopped recovery decision requires a stop condition and reason.")
  }
  const outcome = decision.outcome as "completed" | "blocked"
  const result = await input.stopRecovery({
    outcome,
    stopCondition: decision.stopCondition,
    reason: decision.reason,
    evidenceRefs: [...decision.evidenceRefs],
    partialResultRefs: [...decision.partialResultRefs],
    unresolvedScope: [...decision.unresolvedScope],
    userActions: [...decision.userActions],
    receiptId: decision.receiptId,
  })
  return { status: "recovery_stopped", outcome, receiptId: decision.receiptId, result }
}
