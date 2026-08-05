import { buildYeonjangBrowserActiveTabInfoLlmReviewAdmissionInput, evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision, } from "./yeonjang-browser-active-tab-info-postcheck-llm-review-admission.js";
export function buildYeonjangBrowserActiveTabInfoReviewReadyBundle(input) {
    if (!input.runtimeAssembly.ok) {
        return {
            ok: false,
            reasonCode: input.runtimeAssembly.reasonCode,
            invokeNow: false,
            addRustDispatchNow: false,
            addProductionBindingNow: false,
        };
    }
    const reviewAdmissionInput = buildYeonjangBrowserActiveTabInfoLlmReviewAdmissionInput({
        originalRequest: input.originalRequest,
        completionCriteria: input.completionCriteria,
        finalProjection: input.runtimeAssembly.finalProjection,
        commandAccepted: input.commandAccepted,
        rawDetails: input.rawDetails,
    });
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
    });
}
export function applyYeonjangBrowserActiveTabInfoReviewDecisionToBundle(input) {
    const decision = evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision({
        admissionInput: input.bundle.reviewAdmissionInput,
        review: input.review,
    });
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
    });
}
function statusFromVerification(status) {
    if (status === "verified")
        return "review_verified";
    if (status === "failed")
        return "review_failed";
    return "review_unverifiable";
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-review-ready-bundle.js.map