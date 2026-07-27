import { createHash } from "node:crypto"

export interface MissingInformationResolutionCandidate {
  fieldId: string
  description: string
  systemCanResolve: boolean
  capabilityRefs: string[]
}

export interface LlmClarificationInput {
  requestId: string
  originalRequest: string
  missingInformationCandidates: MissingInformationResolutionCandidate[]
}

export interface LlmMissingInformationAssessment {
  fieldId: string
  impact: "changes_result" | "does_not_change_result"
  reason: string
}

export interface LlmClarificationDecision {
  schemaVersion: 1
  requestId: string
  requestMeaning: string
  completionCriteria: string[]
  missingInformationAssessments: LlmMissingInformationAssessment[]
  selectedAction: "ask_clarification" | "continue"
  clarificationFieldIds: string[]
  clarificationQuestion: string | null
  reason: string
}

export interface LlmClarificationReceipt {
  schemaVersion: 1
  receiptId: string
  requestId: string
  decisionFingerprint: `sha256:${string}`
}

export interface LlmClarificationProvider {
  analyzeClarification(
    input: LlmClarificationInput,
  ): LlmClarificationDecision | Promise<LlmClarificationDecision>
}

export type LlmClarificationRejectionCode =
  | "clarification_schema_invalid"
  | "capability_snapshot_invalid"
  | "request_scope_mismatch"
  | "missing_candidate_assessment_mismatch"
  | "clarification_not_required"
  | "material_user_information_not_requested"
  | "clarification_targets_mismatch"
  | "system_resolvable_information_requested"
  | "clarification_receipt_missing"
  | "clarification_receipt_mismatch"

export type LlmClarificationAdmission =
  | {
      status: "clarification_required"
      requestId: string
      requestMeaning: string
      completionCriteria: string[]
      clarificationFieldIds: string[]
      clarificationQuestion: string
      receiptId: string
    }
  | {
      status: "continue"
      requestId: string
      requestMeaning: string
      completionCriteria: string[]
      receiptId: string
    }
  | { status: "rejected"; reasonCodes: LlmClarificationRejectionCode[] }

function normalized(value: string): string {
  return value.trim()
}

function validTextList(value: unknown, allowEmpty: boolean): value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return false
  if (!value.every((item) => typeof item === "string" && normalized(item))) return false
  const normalizedValues = value.map(normalized)
  return new Set(normalizedValues).size === normalizedValues.length
}

function sameSet(left: string[], right: string[]): boolean {
  if (!validTextList(left, true) || !validTextList(right, true)) return false
  const leftValues = left.map(normalized).sort()
  const rightValues = right.map(normalized).sort()
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  )
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
    .join(",")}}`
}

function decisionFingerprint(decision: LlmClarificationDecision): `sha256:${string}` {
  const hash = createHash("sha256")
    .update(`knowbee:llm-clarification:${canonicalize(decision)}`)
    .digest("hex")
  return `sha256:${hash}`
}

function structurallyValidInput(input: LlmClarificationInput): boolean {
  if (!normalized(input.requestId) || !normalized(input.originalRequest)) return false
  const candidates = input.missingInformationCandidates
  if (!Array.isArray(candidates)) return false
  if (
    !validTextList(
      candidates.map((item) => item.fieldId),
      true,
    )
  )
    return false
  return candidates.every(
    (candidate) =>
      normalized(candidate.description) &&
      typeof candidate.systemCanResolve === "boolean" &&
      validTextList(candidate.capabilityRefs, true) &&
      (!candidate.systemCanResolve || candidate.capabilityRefs.length > 0),
  )
}

function structurallyValidDecision(decision: LlmClarificationDecision): boolean {
  if (
    decision?.schemaVersion !== 1 ||
    !normalized(decision.requestId) ||
    !normalized(decision.requestMeaning) ||
    !validTextList(decision.completionCriteria, false) ||
    !Array.isArray(decision.missingInformationAssessments) ||
    !validTextList(
      decision.missingInformationAssessments.map((assessment) => assessment.fieldId),
      true,
    ) ||
    !decision.missingInformationAssessments.every(
      (assessment) =>
        (assessment.impact === "changes_result" ||
          assessment.impact === "does_not_change_result") &&
        normalized(assessment.reason),
    ) ||
    (decision.selectedAction !== "ask_clarification" && decision.selectedAction !== "continue") ||
    !validTextList(decision.clarificationFieldIds, true) ||
    !normalized(decision.reason)
  ) {
    return false
  }
  if (decision.selectedAction === "ask_clarification") {
    return Boolean(
      decision.clarificationFieldIds.length > 0 &&
        typeof decision.clarificationQuestion === "string" &&
        normalized(decision.clarificationQuestion) &&
        decision.clarificationQuestion.length <= 240,
    )
  }
  return decision.clarificationFieldIds.length === 0 && decision.clarificationQuestion === null
}

export function createLlmClarificationReceipt(input: {
  receiptId: string
  decision: LlmClarificationDecision
}): LlmClarificationReceipt {
  const receiptId = normalized(input.receiptId)
  if (!receiptId) throw new Error("Clarification receipt ID is required.")
  return {
    schemaVersion: 1,
    receiptId,
    requestId: normalized(input.decision.requestId),
    decisionFingerprint: decisionFingerprint(input.decision),
  }
}

export async function runLlmClarificationProvider(input: {
  provider: LlmClarificationProvider
  receiptId: string
  input: LlmClarificationInput
}): Promise<{ decision: LlmClarificationDecision; receipt: LlmClarificationReceipt }> {
  const decision = await input.provider.analyzeClarification(input.input)
  return {
    decision,
    receipt: createLlmClarificationReceipt({ receiptId: input.receiptId, decision }),
  }
}

export function admitLlmClarification(input: {
  input: LlmClarificationInput
  decision: LlmClarificationDecision
  receipt?: LlmClarificationReceipt
}): LlmClarificationAdmission {
  if (!structurallyValidDecision(input.decision)) {
    return { status: "rejected", reasonCodes: ["clarification_schema_invalid"] }
  }

  const reasonCodes: LlmClarificationRejectionCode[] = []
  if (!structurallyValidInput(input.input)) reasonCodes.push("capability_snapshot_invalid")
  if (normalized(input.decision.requestId) !== normalized(input.input.requestId)) {
    reasonCodes.push("request_scope_mismatch")
  }

  const candidateIds = input.input.missingInformationCandidates.map((item) => item.fieldId)
  const assessmentIds = input.decision.missingInformationAssessments.map((item) => item.fieldId)
  if (!sameSet(candidateIds, assessmentIds)) {
    reasonCodes.push("missing_candidate_assessment_mismatch")
  }

  const assessmentById = new Map(
    input.decision.missingInformationAssessments.map((item) => [normalized(item.fieldId), item]),
  )
  const userOnlyMaterialIds = input.input.missingInformationCandidates
    .filter(
      (candidate) =>
        !candidate.systemCanResolve &&
        assessmentById.get(normalized(candidate.fieldId))?.impact === "changes_result",
    )
    .map((candidate) => candidate.fieldId)
  const systemResolvableIds = new Set(
    input.input.missingInformationCandidates
      .filter((candidate) => candidate.systemCanResolve)
      .map((candidate) => normalized(candidate.fieldId)),
  )
  if (
    input.decision.clarificationFieldIds.some((fieldId) =>
      systemResolvableIds.has(normalized(fieldId)),
    )
  ) {
    reasonCodes.push("system_resolvable_information_requested")
  }

  if (input.decision.selectedAction === "ask_clarification") {
    if (userOnlyMaterialIds.length === 0) reasonCodes.push("clarification_not_required")
    if (!sameSet(input.decision.clarificationFieldIds, userOnlyMaterialIds)) {
      reasonCodes.push("clarification_targets_mismatch")
    }
  } else if (userOnlyMaterialIds.length > 0) {
    reasonCodes.push("material_user_information_not_requested")
  }

  if (!input.receipt || !normalized(input.receipt.receiptId)) {
    reasonCodes.push("clarification_receipt_missing")
  } else if (
    input.receipt.schemaVersion !== 1 ||
    normalized(input.receipt.requestId) !== normalized(input.decision.requestId) ||
    input.receipt.decisionFingerprint !== decisionFingerprint(input.decision)
  ) {
    reasonCodes.push("clarification_receipt_mismatch")
  }

  if (reasonCodes.length > 0 || !input.receipt) {
    return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] }
  }
  const base = {
    requestId: normalized(input.decision.requestId),
    requestMeaning: input.decision.requestMeaning,
    completionCriteria: [...input.decision.completionCriteria],
    receiptId: input.receipt.receiptId,
  }
  if (input.decision.selectedAction === "continue") {
    return { status: "continue", ...base }
  }
  return {
    status: "clarification_required",
    ...base,
    clarificationFieldIds: [...input.decision.clarificationFieldIds],
    clarificationQuestion: input.decision.clarificationQuestion ?? "",
  }
}
