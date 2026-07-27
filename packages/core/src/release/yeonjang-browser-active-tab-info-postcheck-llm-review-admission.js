import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
import { isSafeYeonjangBrowserActiveTabInfoEvidenceRef } from "./yeonjang-browser-active-tab-info-final-result-boundary.js";
export function buildYeonjangBrowserActiveTabInfoLlmReviewAdmissionInput(input) {
    return Object.freeze({
        schemaVersion: "yeonjang-browser-active-tab-info-llm-review-admission-v1",
        method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
        originalRequest: normalizeText(input.originalRequest),
        completionCriteria: input.completionCriteria.map(normalizeText).filter(Boolean),
        commandAccepted: input.commandAccepted,
        finalProjection: input.finalProjection,
        successCanBeConcludedWithoutReview: false,
    });
}
export function evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision(input) {
    const evidenceRefs = [...new Set(input.review.evidenceRefs.map((ref) => ref.trim()).filter(Boolean))];
    if (evidenceRefs.length === 0) {
        return decision("unverifiable", "llm_review_evidence_required", false, []);
    }
    if (evidenceRefs.some((ref) => !isSafeYeonjangBrowserActiveTabInfoEvidenceRef(ref))) {
        return decision("unverifiable", "llm_review_evidence_ref_unsafe", false, []);
    }
    const expectedEvidenceRef = input.admissionInput.finalProjection.evidenceRef;
    if (!evidenceRefs.includes(expectedEvidenceRef)) {
        return decision("unverifiable", "llm_review_evidence_required", false, []);
    }
    if (input.review.verdict === "satisfied") {
        return decision("verified", "llm_review_satisfied", true, evidenceRefs);
    }
    if (input.review.verdict === "failed") {
        return decision("failed", "llm_review_failed", false, evidenceRefs);
    }
    return decision("unverifiable", "llm_review_uncertain", false, evidenceRefs);
}
function decision(verificationStatus, reasonCode, goalSuccess, evidenceRefs) {
    return Object.freeze({
        verificationStatus,
        reasonCode,
        goalSuccess,
        evidenceRefs,
    });
}
function normalizeText(value) {
    return value.trim().replace(/\s+/gu, " ");
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-postcheck-llm-review-admission.js.map