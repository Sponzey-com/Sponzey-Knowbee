import type { ToolResult } from "../tools/types.js"
import type { YeonjangEvidenceEnvelope } from "./evidence.js"

export type YeonjangEvidenceAdmissionReasonCode =
  | "YEONJANG_EVIDENCE_MISSING"
  | "YEONJANG_EVIDENCE_INVALID"
  | "YEONJANG_EVIDENCE_TOOL_MISMATCH"
  | "YEONJANG_POST_CHECK_UNVERIFIED"
  | "YEONJANG_GOAL_VALIDATION_RECEIPT_INVALID"

export type YeonjangEvidenceReviewAdmission =
  | {
    status: "admitted"
    evidence: YeonjangEvidenceEnvelope
  }
  | {
    status: "blocked"
    reasonCode: YeonjangEvidenceAdmissionReasonCode
    detail: string
  }

export interface AdmitYeonjangEvidenceForReviewInput {
  result: ToolResult
  expectedToolName: string
}

export function admitYeonjangEvidenceForReview(
  input: AdmitYeonjangEvidenceForReviewInput,
): YeonjangEvidenceReviewAdmission {
  const evidence = readEvidence(input.result)
  if (evidence == null) {
    return blocked(
      "YEONJANG_EVIDENCE_MISSING",
      "Yeonjang result details do not contain normalized evidence.",
    )
  }

  if (!isYeonjangEvidenceEnvelope(evidence)) {
    return blocked(
      "YEONJANG_EVIDENCE_INVALID",
      "Yeonjang result evidence is not a valid yeonjang-evidence-v1 envelope.",
    )
  }

  const expectedToolName = input.expectedToolName.trim()
  if (!expectedToolName || evidence.toolName !== expectedToolName) {
    return blocked(
      "YEONJANG_EVIDENCE_TOOL_MISMATCH",
      `Yeonjang evidence tool mismatch. expected=${expectedToolName} actual=${evidence.toolName}`,
    )
  }

  if (evidence.postCheck.kind === "not_required") {
    return { status: "admitted", evidence }
  }

  if (evidence.postCheck.kind === "verified" && evidence.postCheck.verified === true) {
    return { status: "admitted", evidence }
  }

  if (evidence.postCheck.kind === "goal_validated") {
    if (
      evidence.postCheck.verified === true &&
      isNonEmptyString(evidence.postCheck.diagnosisReceiptId) &&
      evidence.postCheck.diagnosisTarget === "result_diagnosis" &&
      (evidence.postCheck.diagnosisSubjectKind === "validation_result" ||
        evidence.postCheck.diagnosisSubjectKind === "tool_result") &&
      Array.isArray(evidence.postCheck.evidenceRefs) &&
      evidence.postCheck.evidenceRefs.length > 0 &&
      evidence.postCheck.evidenceRefs.every(isNonEmptyString)
    ) {
      return { status: "admitted", evidence }
    }
    return blocked(
      "YEONJANG_GOAL_VALIDATION_RECEIPT_INVALID",
      "Yeonjang goal validation post-check does not contain a valid result diagnosis receipt binding.",
    )
  }

  return blocked(
    "YEONJANG_POST_CHECK_UNVERIFIED",
    `Yeonjang evidence post-check is not verified. kind=${evidence.postCheck.kind}`,
  )
}

function readEvidence(result: ToolResult): unknown {
  if (!isRecord(result.details)) return undefined
  return result.details.evidence
}

function isYeonjangEvidenceEnvelope(value: unknown): value is YeonjangEvidenceEnvelope {
  if (!isRecord(value)) return false
  if (value.schemaVersion !== "yeonjang-evidence-v1") return false
  if (!isNonEmptyString(value.targetRef)) return false
  if (!isNonEmptyString(value.toolName)) return false
  if (!Array.isArray(value.methodIds) || value.methodIds.length === 0) return false
  if (!value.methodIds.every(isNonEmptyString)) return false
  if (!isNonEmptyString(value.group)) return false
  if (!isNonEmptyString(value.riskLevel)) return false
  if (typeof value.requiresApproval !== "boolean") return false
  if (typeof value.collectedAt !== "number" || !Number.isFinite(value.collectedAt)) return false
  if (!isNonEmptyString(value.summary)) return false
  if (value.rawPayloadVisibility !== "audit_only") return false
  return isPostCheck(value.postCheck)
}

function isPostCheck(value: unknown): value is YeonjangEvidenceEnvelope["postCheck"] {
  if (!isRecord(value)) return false
  if (value.kind === "not_required") return true
  if (value.kind === "goal_validated") {
    return (
      value.verified === true &&
      isNonEmptyString(value.diagnosisReceiptId) &&
      value.diagnosisTarget === "result_diagnosis" &&
      (value.diagnosisSubjectKind === "validation_result" ||
        value.diagnosisSubjectKind === "tool_result") &&
      Array.isArray(value.evidenceRefs) &&
      value.evidenceRefs.length > 0 &&
      value.evidenceRefs.every(isNonEmptyString)
    )
  }
  if (value.kind !== "verified" && value.kind !== "failed" && value.kind !== "unverifiable") {
    return false
  }
  return typeof value.verified === "boolean"
}

function blocked(
  reasonCode: YeonjangEvidenceAdmissionReasonCode,
  detail: string,
): YeonjangEvidenceReviewAdmission {
  return {
    status: "blocked",
    reasonCode,
    detail,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}
