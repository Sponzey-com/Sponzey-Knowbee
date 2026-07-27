import type {
  YeonjangBrowserActiveTabInfoFinalResultProjection,
  YeonjangBrowserActiveTabInfoProductLogProjection,
  YeonjangBrowserActiveTabInfoVerificationStatus,
} from "./yeonjang-browser-active-tab-info-final-result-boundary.js"
import type {
  YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult,
} from "./yeonjang-browser-active-tab-info-runtime-result-assembler.js"
import type {
  YeonjangBrowserActiveTabInfoLlmReview,
  YeonjangBrowserActiveTabInfoLlmReviewAdmissionInput,
  YeonjangBrowserActiveTabInfoLlmReviewReasonCode,
} from "./yeonjang-browser-active-tab-info-postcheck-llm-review-admission.js"
import {
  buildYeonjangBrowserActiveTabInfoLlmReviewAdmissionInput,
  evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision,
} from "./yeonjang-browser-active-tab-info-postcheck-llm-review-admission.js"

export type YeonjangBrowserActiveTabInfoReviewReadyBundleResult =
  | {
      ok: true
      status: "review_required"
      goalSuccessBeforeReview: false
      evidenceRef: string
      finalProjection: YeonjangBrowserActiveTabInfoFinalResultProjection
      productLogProjection: YeonjangBrowserActiveTabInfoProductLogProjection
      reviewAdmissionInput: YeonjangBrowserActiveTabInfoLlmReviewAdmissionInput
      invokeNow: false
      addRustDispatchNow: false
      addProductionBindingNow: false
    }
  | {
      ok: false
      reasonCode: Extract<YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult, { ok: false }>["reasonCode"]
      invokeNow: false
      addRustDispatchNow: false
      addProductionBindingNow: false
    }

export type YeonjangBrowserActiveTabInfoReviewedBundleResult =
  | {
      ok: true
      status: "review_verified" | "review_unverifiable" | "review_failed"
      verificationStatus: YeonjangBrowserActiveTabInfoVerificationStatus
      goalSuccess: boolean
      reasonCode: YeonjangBrowserActiveTabInfoLlmReviewReasonCode
      evidenceRefs: string[]
      finalProjection: YeonjangBrowserActiveTabInfoFinalResultProjection
      productLogProjection: YeonjangBrowserActiveTabInfoProductLogProjection
      invokeNow: false
      addRustDispatchNow: false
      addProductionBindingNow: false
    }

export function buildYeonjangBrowserActiveTabInfoReviewReadyBundle(input: {
  runtimeAssembly: YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult
  originalRequest: string
  completionCriteria: readonly string[]
  commandAccepted: boolean
  rawDetails?: Record<string, unknown> | undefined
}): YeonjangBrowserActiveTabInfoReviewReadyBundleResult {
  if (!input.runtimeAssembly.ok) {
    return {
      ok: false,
      reasonCode: input.runtimeAssembly.reasonCode,
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    }
  }

  const reviewAdmissionInput = buildYeonjangBrowserActiveTabInfoLlmReviewAdmissionInput({
    originalRequest: input.originalRequest,
    completionCriteria: input.completionCriteria,
    finalProjection: input.runtimeAssembly.finalProjection,
    commandAccepted: input.commandAccepted,
    rawDetails: input.rawDetails,
  })

  return Object.freeze({
    ok: true,
    status: "review_required",
    goalSuccessBeforeReview: false,
    evidenceRef: input.runtimeAssembly.evidenceRef,
    finalProjection: input.runtimeAssembly.finalProjection,
    productLogProjection: input.runtimeAssembly.productLogProjection,
    reviewAdmissionInput,
    invokeNow: false,
    addRustDispatchNow: false,
    addProductionBindingNow: false,
  })
}

export function applyYeonjangBrowserActiveTabInfoReviewDecisionToBundle(input: {
  bundle: Extract<YeonjangBrowserActiveTabInfoReviewReadyBundleResult, { ok: true }>
  review: YeonjangBrowserActiveTabInfoLlmReview
}): YeonjangBrowserActiveTabInfoReviewedBundleResult {
  const decision = evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision({
    admissionInput: input.bundle.reviewAdmissionInput,
    review: input.review,
  })
  return Object.freeze({
    ok: true,
    status: statusFromVerification(decision.verificationStatus),
    verificationStatus: decision.verificationStatus,
    goalSuccess: decision.goalSuccess,
    reasonCode: decision.reasonCode,
    evidenceRefs: decision.evidenceRefs,
    finalProjection: {
      ...input.bundle.finalProjection,
      verificationStatus: decision.verificationStatus,
    },
    productLogProjection: input.bundle.productLogProjection,
    invokeNow: false,
    addRustDispatchNow: false,
    addProductionBindingNow: false,
  })
}

function statusFromVerification(
  status: YeonjangBrowserActiveTabInfoVerificationStatus,
): "review_verified" | "review_unverifiable" | "review_failed" {
  if (status === "verified") return "review_verified"
  if (status === "failed") return "review_failed"
  return "review_unverifiable"
}
