import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
import type { YeonjangBrowserActiveTabInfoFinalResultProjection, YeonjangBrowserActiveTabInfoVerificationStatus } from "./yeonjang-browser-active-tab-info-final-result-boundary.js";
export type YeonjangBrowserActiveTabInfoLlmReviewVerdict = "satisfied" | "uncertain" | "failed";
export type YeonjangBrowserActiveTabInfoLlmReviewReasonCode = "llm_review_satisfied" | "llm_review_uncertain" | "llm_review_failed" | "llm_review_evidence_required" | "llm_review_evidence_ref_unsafe";
export interface YeonjangBrowserActiveTabInfoLlmReviewAdmissionInput {
    schemaVersion: "yeonjang-browser-active-tab-info-llm-review-admission-v1";
    method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method;
    originalRequest: string;
    completionCriteria: string[];
    commandAccepted: boolean;
    finalProjection: YeonjangBrowserActiveTabInfoFinalResultProjection;
    successCanBeConcludedWithoutReview: false;
}
export interface YeonjangBrowserActiveTabInfoLlmReview {
    verdict: YeonjangBrowserActiveTabInfoLlmReviewVerdict;
    evidenceRefs: readonly string[];
    reason: string;
}
export interface YeonjangBrowserActiveTabInfoLlmReviewDecision {
    verificationStatus: YeonjangBrowserActiveTabInfoVerificationStatus;
    reasonCode: YeonjangBrowserActiveTabInfoLlmReviewReasonCode;
    goalSuccess: boolean;
    evidenceRefs: string[];
}
export declare function buildYeonjangBrowserActiveTabInfoLlmReviewAdmissionInput(input: {
    originalRequest: string;
    completionCriteria: readonly string[];
    finalProjection: YeonjangBrowserActiveTabInfoFinalResultProjection;
    commandAccepted: boolean;
    rawDetails?: Record<string, unknown> | undefined;
}): YeonjangBrowserActiveTabInfoLlmReviewAdmissionInput;
export declare function evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision(input: {
    admissionInput: YeonjangBrowserActiveTabInfoLlmReviewAdmissionInput;
    review: YeonjangBrowserActiveTabInfoLlmReview;
}): YeonjangBrowserActiveTabInfoLlmReviewDecision;
//# sourceMappingURL=yeonjang-browser-active-tab-info-postcheck-llm-review-admission.d.ts.map