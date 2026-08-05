export type UserMethodBoundary = "safety" | "privacy" | "permission" | "approval" | "legal"

export type UserMethodBoundaryDecision = "allowed" | "approval_required" | "denied"

export interface UserMethodBoundaryReview {
  receiptId: string
  requestId: string
  methodId: string
  targetId: string
  decisions: Record<UserMethodBoundary, UserMethodBoundaryDecision>
  evidenceRefs: string[]
}

export interface UserMethodBoundaryInput {
  requestId: string
  methodId: string
  targetId: string
  selectionReceiptId: string
  review: UserMethodBoundaryReview
}

export type UserMethodBoundaryAdmission =
  | {
      status: "allowed"
      requestId: string
      methodId: string
      targetId: string
      selectionReceiptId: string
      boundaryReviewReceiptId: string
    }
  | {
      status: "approval_required"
      requestId: string
      methodId: string
      targetId: string
      requiredBoundaries: UserMethodBoundary[]
    }
  | {
      status: "denied"
      requestId: string
      methodId: string
      targetId: string
      deniedBoundaries: UserMethodBoundary[]
    }
  | {
      status: "rejected"
      reasonCodes: Array<
        "boundary_input_invalid" | "boundary_review_invalid" | "boundary_review_scope_mismatch"
      >
    }

export interface ExclusiveMethodFailureReceipt {
  receiptId: string
  requestId: string
  methodId: string
  targetId: string
  verified: boolean
  reason: string
  evidenceRefs: string[]
}

export interface ExclusiveMethodAlternative {
  methodId: string
  targetId: string
  reason: string
  evidenceRefs: string[]
}

export interface ExclusiveMethodSwitchApprovalReceipt {
  receiptId: string
  requestId: string
  fromMethodId: string
  toMethodId: string
  targetId: string
  actorType: "user" | "system" | "administrator"
  actorId: string
  decision: "approved" | "denied"
}

export interface ExclusiveMethodFallbackInput {
  requestId: string
  targetId: string
  exclusiveMethodIds: string[]
  failedMethodId: string
  failure: ExclusiveMethodFailureReceipt
  alternatives: ExclusiveMethodAlternative[]
  switchApproval?: ExclusiveMethodSwitchApprovalReceipt
}

export type ExclusiveMethodFallbackRejectionCode =
  | "exclusive_input_invalid"
  | "exclusive_failure_invalid"
  | "exclusive_failure_scope_mismatch"
  | "alternatives_invalid"
  | "alternatives_not_minimal"
  | "switch_approval_invalid"
  | "switch_approval_scope_mismatch"
  | "switch_approval_actor_invalid"
  | "switch_approval_denied"

export type ExclusiveMethodFallbackDecision =
  | {
      status: "awaiting_user"
      requestId: string
      failedMethodId: string
      targetId: string
      failureReason: string
      failureEvidenceRefs: string[]
      alternatives: ExclusiveMethodAlternative[]
    }
  | {
      status: "switch_authorized"
      requestId: string
      fromMethodId: string
      toMethodId: string
      targetId: string
      approvalReceiptId: string
    }
  | { status: "rejected"; reasonCodes: ExclusiveMethodFallbackRejectionCode[] }

const BOUNDARIES: readonly UserMethodBoundary[] = [
  "safety",
  "privacy",
  "permission",
  "approval",
  "legal",
]

function normalized(value: string): string {
  return value.trim()
}

function uniqueText(values: string[], allowEmpty = false): boolean {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) return false
  const normalizedValues = values.map(normalized)
  return normalizedValues.every(Boolean) && new Set(normalizedValues).size === values.length
}

export function admitUserMethodBoundaries(
  input: UserMethodBoundaryInput,
): UserMethodBoundaryAdmission {
  if (
    !normalized(input.requestId) ||
    !normalized(input.methodId) ||
    !normalized(input.targetId) ||
    !normalized(input.selectionReceiptId)
  ) {
    return { status: "rejected", reasonCodes: ["boundary_input_invalid"] }
  }
  const review = input.review
  if (
    !normalized(review.receiptId) ||
    !uniqueText(review.evidenceRefs) ||
    BOUNDARIES.some(
      (boundary) =>
        !["allowed", "approval_required", "denied"].includes(review.decisions[boundary]),
    )
  ) {
    return { status: "rejected", reasonCodes: ["boundary_review_invalid"] }
  }
  if (
    normalized(review.requestId) !== normalized(input.requestId) ||
    normalized(review.methodId) !== normalized(input.methodId) ||
    normalized(review.targetId) !== normalized(input.targetId)
  ) {
    return { status: "rejected", reasonCodes: ["boundary_review_scope_mismatch"] }
  }

  const base = {
    requestId: normalized(input.requestId),
    methodId: normalized(input.methodId),
    targetId: normalized(input.targetId),
  }
  const deniedBoundaries = BOUNDARIES.filter((boundary) => review.decisions[boundary] === "denied")
  if (deniedBoundaries.length > 0) return { status: "denied", ...base, deniedBoundaries }
  const requiredBoundaries = BOUNDARIES.filter(
    (boundary) => review.decisions[boundary] === "approval_required",
  )
  if (requiredBoundaries.length > 0) {
    return { status: "approval_required", ...base, requiredBoundaries }
  }
  return {
    status: "allowed",
    ...base,
    selectionReceiptId: normalized(input.selectionReceiptId),
    boundaryReviewReceiptId: normalized(review.receiptId),
  }
}

function validAlternative(
  alternative: ExclusiveMethodAlternative,
  targetId: string,
  exclusiveMethods: Set<string>,
): boolean {
  return (
    Boolean(normalized(alternative.methodId)) &&
    normalized(alternative.targetId) === targetId &&
    !exclusiveMethods.has(normalized(alternative.methodId)) &&
    Boolean(normalized(alternative.reason)) &&
    uniqueText(alternative.evidenceRefs)
  )
}

export function decideExclusiveMethodFallback(
  input: ExclusiveMethodFallbackInput,
): ExclusiveMethodFallbackDecision {
  const requestId = normalized(input.requestId)
  const targetId = normalized(input.targetId)
  const failedMethodId = normalized(input.failedMethodId)
  if (
    !requestId ||
    !targetId ||
    !failedMethodId ||
    !uniqueText(input.exclusiveMethodIds) ||
    !input.exclusiveMethodIds.map(normalized).includes(failedMethodId)
  ) {
    return { status: "rejected", reasonCodes: ["exclusive_input_invalid"] }
  }
  const failure = input.failure
  if (
    !normalized(failure.receiptId) ||
    !failure.verified ||
    !normalized(failure.reason) ||
    !uniqueText(failure.evidenceRefs)
  ) {
    return { status: "rejected", reasonCodes: ["exclusive_failure_invalid"] }
  }
  if (
    normalized(failure.requestId) !== requestId ||
    normalized(failure.methodId) !== failedMethodId ||
    normalized(failure.targetId) !== targetId
  ) {
    return { status: "rejected", reasonCodes: ["exclusive_failure_scope_mismatch"] }
  }
  if (input.alternatives.length < 1) {
    return { status: "rejected", reasonCodes: ["alternatives_invalid"] }
  }
  if (input.alternatives.length > 3) {
    return { status: "rejected", reasonCodes: ["alternatives_not_minimal"] }
  }
  const exclusiveMethods = new Set(input.exclusiveMethodIds.map(normalized))
  const alternativeIds = input.alternatives.map((alternative) => normalized(alternative.methodId))
  if (
    new Set(alternativeIds).size !== input.alternatives.length ||
    input.alternatives.some(
      (alternative) => !validAlternative(alternative, targetId, exclusiveMethods),
    )
  ) {
    return { status: "rejected", reasonCodes: ["alternatives_invalid"] }
  }

  const approval = input.switchApproval
  if (!approval) {
    return {
      status: "awaiting_user",
      requestId,
      failedMethodId,
      targetId,
      failureReason: normalized(failure.reason),
      failureEvidenceRefs: failure.evidenceRefs.map(normalized),
      alternatives: input.alternatives,
    }
  }
  if (!normalized(approval.receiptId) || !normalized(approval.actorId)) {
    return { status: "rejected", reasonCodes: ["switch_approval_invalid"] }
  }
  if (
    normalized(approval.requestId) !== requestId ||
    normalized(approval.fromMethodId) !== failedMethodId ||
    normalized(approval.targetId) !== targetId ||
    !alternativeIds.includes(normalized(approval.toMethodId))
  ) {
    return { status: "rejected", reasonCodes: ["switch_approval_scope_mismatch"] }
  }
  if (approval.actorType !== "user") {
    return { status: "rejected", reasonCodes: ["switch_approval_actor_invalid"] }
  }
  if (approval.decision !== "approved") {
    return { status: "rejected", reasonCodes: ["switch_approval_denied"] }
  }
  return {
    status: "switch_authorized",
    requestId,
    fromMethodId: failedMethodId,
    toMethodId: normalized(approval.toMethodId),
    targetId,
    approvalReceiptId: normalized(approval.receiptId),
  }
}
