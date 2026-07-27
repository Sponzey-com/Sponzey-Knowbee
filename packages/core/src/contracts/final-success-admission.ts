export interface FinalStepReceipt {
  receiptId: string
  workId: string
  stepId: string
  status: "succeeded" | "partial" | "failed"
}

export interface FinalCriterionDecision {
  criterionId: string
  status: "satisfied" | "unsatisfied"
  evidenceRefs: string[]
}

export interface FinalResultReview {
  receiptId: string
  workId: string
  sufficiency: "sufficient" | "partial" | "insufficient"
  resultRef: string
  requiredEvidenceRefs: string[]
}

export interface FinalDeliveryReceipt {
  receiptId: string
  workId: string
  resultRef: string
  status: "delivered" | "failed"
}

export interface FinalSuccessAdmissionInput {
  workId: string
  analyzedStepIds: string[]
  stepReceipts: FinalStepReceipt[]
  criteria: FinalCriterionDecision[]
  resultReview: FinalResultReview
  finalPayload: { resultRef: string; evidenceRefs: string[] }
  deliveryReceipt?: FinalDeliveryReceipt
}

export type FinalSuccessRejectionCode =
  | "final_success_schema_invalid"
  | "final_success_scope_mismatch"
  | "analyzed_steps_incomplete"
  | "completion_criteria_unsatisfied"
  | "result_not_sufficient"
  | "required_evidence_missing"
  | "final_evidence_mismatch"
  | "final_result_mismatch"
  | "final_delivery_missing"
  | "final_delivery_failed"

export type FinalSuccessAdmission =
  | {
      status: "success"
      workId: string
      resultRef: string
      evidenceRefs: string[]
      reviewReceiptId: string
      deliveryReceiptId: string
    }
  | { status: "rejected"; reasonCodes: FinalSuccessRejectionCode[] }

function normalized(value: string): string {
  return value.trim()
}

function validUniqueText(values: string[], allowEmpty = false): boolean {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) return false
  const normalizedValues = values.map(normalized)
  return normalizedValues.every(Boolean) && new Set(normalizedValues).size === values.length
}

function sameSet(left: string[], right: string[]): boolean {
  if (!validUniqueText(left, true) || !validUniqueText(right, true)) return false
  const leftValues = left.map(normalized).sort()
  const rightValues = right.map(normalized).sort()
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  )
}

function structurallyValid(input: FinalSuccessAdmissionInput): boolean {
  return Boolean(
    normalized(input.workId) &&
      validUniqueText(input.analyzedStepIds) &&
      Array.isArray(input.stepReceipts) &&
      validUniqueText(input.stepReceipts.map((receipt) => receipt.receiptId)) &&
      validUniqueText(input.stepReceipts.map((receipt) => receipt.stepId)) &&
      Array.isArray(input.criteria) &&
      input.criteria.length > 0 &&
      validUniqueText(input.criteria.map((criterion) => criterion.criterionId)) &&
      input.criteria.every((criterion) => validUniqueText(criterion.evidenceRefs)) &&
      normalized(input.resultReview.receiptId) &&
      normalized(input.resultReview.workId) &&
      normalized(input.resultReview.resultRef) &&
      validUniqueText(input.resultReview.requiredEvidenceRefs) &&
      normalized(input.finalPayload.resultRef) &&
      validUniqueText(input.finalPayload.evidenceRefs),
  )
}

export function admitFinalSuccess(input: FinalSuccessAdmissionInput): FinalSuccessAdmission {
  if (!structurallyValid(input)) {
    return { status: "rejected", reasonCodes: ["final_success_schema_invalid"] }
  }
  const reasonCodes: FinalSuccessRejectionCode[] = []
  const workId = normalized(input.workId)
  if (
    normalized(input.resultReview.workId) !== workId ||
    input.stepReceipts.some((receipt) => normalized(receipt.workId) !== workId) ||
    (input.deliveryReceipt && normalized(input.deliveryReceipt.workId) !== workId)
  ) {
    reasonCodes.push("final_success_scope_mismatch")
  }

  const successfulStepIds = input.stepReceipts
    .filter((receipt) => receipt.status === "succeeded")
    .map((receipt) => receipt.stepId)
  if (!sameSet(successfulStepIds, input.analyzedStepIds)) {
    reasonCodes.push("analyzed_steps_incomplete")
  }
  if (input.criteria.some((criterion) => criterion.status !== "satisfied")) {
    reasonCodes.push("completion_criteria_unsatisfied")
  }
  if (input.resultReview.sufficiency !== "sufficient") {
    reasonCodes.push("result_not_sufficient")
  }

  const availableEvidence = new Set(
    input.criteria.flatMap((criterion) => criterion.evidenceRefs).map(normalized),
  )
  if (
    input.resultReview.requiredEvidenceRefs.some(
      (evidenceRef) => !availableEvidence.has(normalized(evidenceRef)),
    )
  ) {
    reasonCodes.push("required_evidence_missing")
  }
  if (!sameSet(input.finalPayload.evidenceRefs, input.resultReview.requiredEvidenceRefs)) {
    reasonCodes.push("final_evidence_mismatch")
    if (
      input.resultReview.requiredEvidenceRefs.some(
        (evidenceRef) =>
          !input.finalPayload.evidenceRefs.map(normalized).includes(normalized(evidenceRef)),
      )
    ) {
      reasonCodes.push("required_evidence_missing")
    }
  }
  if (normalized(input.finalPayload.resultRef) !== normalized(input.resultReview.resultRef)) {
    reasonCodes.push("final_result_mismatch")
  }

  const delivery = input.deliveryReceipt
  if (!delivery || !normalized(delivery.receiptId)) {
    reasonCodes.push("final_delivery_missing")
  } else {
    if (delivery.status !== "delivered") reasonCodes.push("final_delivery_failed")
    if (normalized(delivery.resultRef) !== normalized(input.resultReview.resultRef)) {
      reasonCodes.push("final_result_mismatch")
    }
  }
  if (reasonCodes.length > 0 || !delivery) {
    return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] }
  }
  return {
    status: "success",
    workId,
    resultRef: input.resultReview.resultRef,
    evidenceRefs: [...input.resultReview.requiredEvidenceRefs].map(normalized).sort(),
    reviewReceiptId: input.resultReview.receiptId,
    deliveryReceiptId: delivery.receiptId,
  }
}
