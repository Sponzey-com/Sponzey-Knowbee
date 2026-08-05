import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js"
import type {
  YeonjangBrowserActiveTabInfoFinalResultProjection,
  YeonjangBrowserActiveTabInfoVerificationStatus,
} from "./yeonjang-browser-active-tab-info-final-result-boundary.js"
import { isSafeYeonjangBrowserActiveTabInfoEvidenceRef } from "./yeonjang-browser-active-tab-info-final-result-boundary.js"

export type YeonjangBrowserActiveTabInfoLlmReviewVerdict = "satisfied" | "uncertain" | "failed"

export type YeonjangBrowserActiveTabInfoLlmReviewReasonCode =
  | "llm_review_satisfied"
  | "llm_review_uncertain"
  | "llm_review_failed"
  | "llm_review_evidence_required"
  | "llm_review_evidence_ref_unsafe"

export interface YeonjangBrowserActiveTabInfoLlmReviewAdmissionInput {
  schemaVersion: "yeonjang-browser-active-tab-info-llm-review-admission-v1"
  method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method
  originalRequest: string
  completionCriteria: string[]
  commandAccepted: boolean
  finalProjection: YeonjangBrowserActiveTabInfoFinalResultProjection
  successCanBeConcludedWithoutReview: false
}

export interface YeonjangBrowserActiveTabInfoLlmReview {
  verdict: YeonjangBrowserActiveTabInfoLlmReviewVerdict
  evidenceRefs: readonly string[]
  reason: string
}

export interface YeonjangBrowserActiveTabInfoLlmReviewDecision {
  verificationStatus: YeonjangBrowserActiveTabInfoVerificationStatus
  reasonCode: YeonjangBrowserActiveTabInfoLlmReviewReasonCode
  goalSuccess: boolean
  evidenceRefs: string[]
}

export function buildYeonjangBrowserActiveTabInfoLlmReviewAdmissionInput(input: {
  originalRequest: string
  completionCriteria: readonly string[]
  finalProjection: YeonjangBrowserActiveTabInfoFinalResultProjection
  commandAccepted: boolean
  rawDetails?: Record<string, unknown> | undefined
}): YeonjangBrowserActiveTabInfoLlmReviewAdmissionInput {
  return Object.freeze({
    schemaVersion: "yeonjang-browser-active-tab-info-llm-review-admission-v1",
    method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
    originalRequest: normalizeText(input.originalRequest),
    completionCriteria: input.completionCriteria.map(normalizeText).filter(Boolean),
    commandAccepted: input.commandAccepted,
    finalProjection: input.finalProjection,
    successCanBeConcludedWithoutReview: false,
  })
}

export function evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision(input: {
  admissionInput: YeonjangBrowserActiveTabInfoLlmReviewAdmissionInput
  review: YeonjangBrowserActiveTabInfoLlmReview
}): YeonjangBrowserActiveTabInfoLlmReviewDecision {
  const evidenceRefs = [...new Set(input.review.evidenceRefs.map((ref) => ref.trim()).filter(Boolean))]
  if (evidenceRefs.length === 0) {
    return decision("unverifiable", "llm_review_evidence_required", false, [])
  }
  if (evidenceRefs.some((ref) => !isSafeYeonjangBrowserActiveTabInfoEvidenceRef(ref))) {
    return decision("unverifiable", "llm_review_evidence_ref_unsafe", false, [])
  }
  const expectedEvidenceRef = input.admissionInput.finalProjection.evidenceRef
  if (!evidenceRefs.includes(expectedEvidenceRef)) {
    return decision("unverifiable", "llm_review_evidence_required", false, [])
  }

  if (input.review.verdict === "satisfied") {
    return decision("verified", "llm_review_satisfied", true, evidenceRefs)
  }
  if (input.review.verdict === "failed") {
    return decision("failed", "llm_review_failed", false, evidenceRefs)
  }
  return decision("unverifiable", "llm_review_uncertain", false, evidenceRefs)
}

function decision(
  verificationStatus: YeonjangBrowserActiveTabInfoVerificationStatus,
  reasonCode: YeonjangBrowserActiveTabInfoLlmReviewReasonCode,
  goalSuccess: boolean,
  evidenceRefs: string[],
): YeonjangBrowserActiveTabInfoLlmReviewDecision {
  return Object.freeze({
    verificationStatus,
    reasonCode,
    goalSuccess,
    evidenceRefs,
  })
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, " ")
}
