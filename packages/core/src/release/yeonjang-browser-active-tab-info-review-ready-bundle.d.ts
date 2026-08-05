import type { YeonjangBrowserActiveTabInfoFinalResultProjection, YeonjangBrowserActiveTabInfoProductLogProjection, YeonjangBrowserActiveTabInfoVerificationStatus } from "./yeonjang-browser-active-tab-info-final-result-boundary.js";
import type { YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult } from "./yeonjang-browser-active-tab-info-runtime-result-assembler.js";
import type { YeonjangBrowserActiveTabInfoLlmReview, YeonjangBrowserActiveTabInfoLlmReviewAdmissionInput, YeonjangBrowserActiveTabInfoLlmReviewReasonCode } from "./yeonjang-browser-active-tab-info-postcheck-llm-review-admission.js";
export type YeonjangBrowserActiveTabInfoReviewReadyBundleResult = {
    ok: true;
    status: "review_required";
    goalSuccessBeforeReview: false;
    evidenceRef: string;
    finalProjection: YeonjangBrowserActiveTabInfoFinalResultProjection;
    productLogProjection: YeonjangBrowserActiveTabInfoProductLogProjection;
    reviewAdmissionInput: YeonjangBrowserActiveTabInfoLlmReviewAdmissionInput;
    invokeNow: false;
    addRustDispatchNow: false;
    addProductionBindingNow: false;
} | {
    ok: false;
    reasonCode: Extract<YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult, {
        ok: false;
    }>["reasonCode"];
    invokeNow: false;
    addRustDispatchNow: false;
    addProductionBindingNow: false;
};
export type YeonjangBrowserActiveTabInfoReviewedBundleResult = {
    ok: true;
    status: "review_verified" | "review_unverifiable" | "review_failed";
    verificationStatus: YeonjangBrowserActiveTabInfoVerificationStatus;
    goalSuccess: boolean;
    reasonCode: YeonjangBrowserActiveTabInfoLlmReviewReasonCode;
    evidenceRefs: string[];
    finalProjection: YeonjangBrowserActiveTabInfoFinalResultProjection;
    productLogProjection: YeonjangBrowserActiveTabInfoProductLogProjection;
    invokeNow: false;
    addRustDispatchNow: false;
    addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReviewReadyBundle(input: {
    runtimeAssembly: YeonjangBrowserActiveTabInfoRuntimeResultAssemblyResult;
    originalRequest: string;
    completionCriteria: readonly string[];
    commandAccepted: boolean;
    rawDetails?: Record<string, unknown> | undefined;
}): YeonjangBrowserActiveTabInfoReviewReadyBundleResult;
export declare function applyYeonjangBrowserActiveTabInfoReviewDecisionToBundle(input: {
    bundle: Extract<YeonjangBrowserActiveTabInfoReviewReadyBundleResult, {
        ok: true;
    }>;
    review: YeonjangBrowserActiveTabInfoLlmReview;
}): YeonjangBrowserActiveTabInfoReviewedBundleResult;
//# sourceMappingURL=yeonjang-browser-active-tab-info-review-ready-bundle.d.ts.map