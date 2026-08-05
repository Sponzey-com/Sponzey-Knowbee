import type { StructuredFailureRecoveryDecision } from "./failure-recovery-decision.js"

export type RecoveryAlternativeImpact = "user_intent" | "safety_boundary" | "permission_scope"

export type RecoveryAlternativeConfirmationAuthority =
  | "user"
  | "safety_policy_owner"
  | "permission_owner"

export interface LlmRecoveryAlternativeImpactAssessment {
  receiptId: string
  workId: string
  recoveryReceiptId: string
  nextAttemptSignature: string
  impacts: RecoveryAlternativeImpact[]
  reason: string
}

export interface RecoveryAlternativeConfirmationReceipt {
  receiptId: string
  workId: string
  recoveryReceiptId: string
  nextAttemptSignature: string
  impact: RecoveryAlternativeImpact
  authority: RecoveryAlternativeConfirmationAuthority
  decision: "approved" | "denied"
  issuedAt: number
  expiresAt: number
}

export interface RecoveryAlternativeConfirmationInput {
  now: number
  workId: string
  recoveryDecision: StructuredFailureRecoveryDecision
  impactAssessment: LlmRecoveryAlternativeImpactAssessment
  confirmations: RecoveryAlternativeConfirmationReceipt[]
}

export type RecoveryAlternativeConfirmationRejectionCode =
  | "recovery_decision_not_ready"
  | "alternative_method_not_changed"
  | "impact_assessment_invalid"
  | "impact_assessment_scope_mismatch"
  | "confirmation_invalid"
  | "confirmation_scope_mismatch"
  | "confirmation_authority_mismatch"
  | "confirmation_denied"
  | "confirmation_stale"

export type RecoveryAlternativeConfirmationAdmission =
  | {
      status: "allowed"
      workId: string
      recoveryReceiptId: string
      impactAssessmentReceiptId: string
      confirmationReceiptIds: string[]
      nextAttemptSignature: string
    }
  | {
      status: "confirmation_required"
      workId: string
      recoveryReceiptId: string
      required: Array<{
        impact: RecoveryAlternativeImpact
        authority: RecoveryAlternativeConfirmationAuthority
      }>
    }
  | { status: "rejected"; reasonCodes: RecoveryAlternativeConfirmationRejectionCode[] }

const IMPACT_AUTHORITY: Readonly<
  Record<RecoveryAlternativeImpact, RecoveryAlternativeConfirmationAuthority>
> = {
  user_intent: "user",
  safety_boundary: "safety_policy_owner",
  permission_scope: "permission_owner",
}

const METHOD_DIMENSIONS = new Set(["strategy", "tool", "delegation_target"])

function normalized(value: string): string {
  return value.trim()
}

function uniqueNonEmpty(values: string[]): boolean {
  const normalizedValues = values.map(normalized)
  return normalizedValues.every(Boolean) && new Set(normalizedValues).size === values.length
}

function sameScope(
  input: RecoveryAlternativeConfirmationInput,
  value: {
    workId: string
    recoveryReceiptId: string
    nextAttemptSignature: string
  },
): boolean {
  return (
    normalized(value.workId) === normalized(input.workId) &&
    normalized(value.recoveryReceiptId) === normalized(input.recoveryDecision.receiptId) &&
    normalized(value.nextAttemptSignature) ===
      normalized(input.recoveryDecision.nextAttemptSignature ?? "")
  )
}

function validImpacts(impacts: RecoveryAlternativeImpact[]): boolean {
  return (
    Array.isArray(impacts) &&
    new Set(impacts).size === impacts.length &&
    impacts.every((impact) => Object.hasOwn(IMPACT_AUTHORITY, impact))
  )
}

export function admitRecoveryAlternativeConfirmation(
  input: RecoveryAlternativeConfirmationInput,
): RecoveryAlternativeConfirmationAdmission {
  const reasonCodes: RecoveryAlternativeConfirmationRejectionCode[] = []
  const workId = normalized(input.workId)
  const recoveryReceiptId = normalized(input.recoveryDecision.receiptId)
  const nextAttemptSignature = normalized(input.recoveryDecision.nextAttemptSignature ?? "")
  const decisionReady =
    input.recoveryDecision.state === "retry_ready" &&
    (input.recoveryDecision.outcome === "retry" ||
      input.recoveryDecision.outcome === "redelegate") &&
    Boolean(input.recoveryDecision.selectedCandidate) &&
    Boolean(workId && recoveryReceiptId && nextAttemptSignature)
  if (!decisionReady) reasonCodes.push("recovery_decision_not_ready")
  if (
    !input.recoveryDecision.changedDimensions?.some((dimension) => METHOD_DIMENSIONS.has(dimension))
  ) {
    reasonCodes.push("alternative_method_not_changed")
  }

  const assessment = input.impactAssessment
  if (
    !normalized(assessment.receiptId) ||
    !normalized(assessment.reason) ||
    !validImpacts(assessment.impacts)
  ) {
    reasonCodes.push("impact_assessment_invalid")
  }
  if (!sameScope(input, assessment)) {
    reasonCodes.push("impact_assessment_scope_mismatch")
  }
  if (!Number.isSafeInteger(input.now)) reasonCodes.push("confirmation_invalid")

  const declaredImpacts = new Set(assessment.impacts)
  const confirmationIds = input.confirmations.map((receipt) => normalized(receipt.receiptId))
  const confirmationImpacts = input.confirmations.map((receipt) => receipt.impact)
  if (
    !uniqueNonEmpty(confirmationIds) ||
    new Set(confirmationImpacts).size !== confirmationImpacts.length ||
    confirmationImpacts.some((impact) => !declaredImpacts.has(impact))
  ) {
    reasonCodes.push("confirmation_invalid")
  }

  for (const receipt of input.confirmations) {
    if (!sameScope(input, receipt)) reasonCodes.push("confirmation_scope_mismatch")
    if (receipt.authority !== IMPACT_AUTHORITY[receipt.impact]) {
      reasonCodes.push("confirmation_authority_mismatch")
    }
    if (receipt.decision === "denied") reasonCodes.push("confirmation_denied")
    if (
      !Number.isSafeInteger(receipt.issuedAt) ||
      !Number.isSafeInteger(receipt.expiresAt) ||
      receipt.issuedAt > input.now ||
      receipt.expiresAt < input.now ||
      receipt.expiresAt <= receipt.issuedAt
    ) {
      reasonCodes.push("confirmation_stale")
    }
  }

  if (reasonCodes.length > 0) {
    return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] }
  }

  const approved = new Set(input.confirmations.map((receipt) => receipt.impact))
  const required = assessment.impacts
    .filter((impact) => !approved.has(impact))
    .map((impact) => ({ impact, authority: IMPACT_AUTHORITY[impact] }))
  if (required.length > 0) {
    return { status: "confirmation_required", workId, recoveryReceiptId, required }
  }

  return {
    status: "allowed",
    workId,
    recoveryReceiptId,
    impactAssessmentReceiptId: normalized(assessment.receiptId),
    confirmationReceiptIds: confirmationIds,
    nextAttemptSignature,
  }
}
