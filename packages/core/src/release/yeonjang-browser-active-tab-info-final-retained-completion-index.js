import { createHash } from "node:crypto";
const SAFE_FINAL_RETAINED_COMPLETION_INDEX_REF_PATTERN = /^final-retained-completion-index:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_RETAINED_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN = /^retained-completion:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorFinalRetainedAcknowledgementReceiptId(receipt) {
    if (receipt.status !==
        "operator_final_retained_acknowledgement_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorFinalRetainedAcknowledgementReceiptId;
}
function buildFinalRetainedCompletionIndexId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorFinalRetainedAcknowledgementReceiptId,
        input.sanitizedFinalRetainedCompletionIndexRef,
        input.productLogEvidenceRef,
        input.retainedCompletionAcknowledgementRef,
        input.indexStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-retained-completion-index:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-index.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.index === undefined ? {} : { index: input.index }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex(input) {
    const blockingReasonCodes = [];
    const operatorFinalRetainedAcknowledgementReceiptId = extractOperatorFinalRetainedAcknowledgementReceiptId(input.operatorFinalRetainedAcknowledgementReceipt);
    if (operatorFinalRetainedAcknowledgementReceiptId === undefined) {
        blockingReasonCodes.push("final_retained_completion_index_receipt_not_ready");
    }
    const sanitizedFinalRetainedCompletionIndexRef = input.sanitizedFinalRetainedCompletionIndexRef.trim();
    if (!SAFE_FINAL_RETAINED_COMPLETION_INDEX_REF_PATTERN.test(sanitizedFinalRetainedCompletionIndexRef)) {
        blockingReasonCodes.push("final_retained_completion_index_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_retained_completion_index_product_log_evidence_ref_invalid");
    }
    const retainedCompletionAcknowledgementRef = input.retainedCompletionAcknowledgementRef.trim();
    if (!SAFE_RETAINED_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN.test(retainedCompletionAcknowledgementRef)) {
        blockingReasonCodes.push("final_retained_completion_index_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        operatorFinalRetainedAcknowledgementReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_retained_completion_index_blocked",
            blockingReasonCodes,
        });
    }
    const indexStatus = "ready";
    return baseResult({
        status: "final_retained_completion_index_ready",
        reasonCode: "active_tab_info_final_retained_completion_index_ready",
        index: Object.freeze({
            finalRetainedCompletionIndexId: buildFinalRetainedCompletionIndexId({
                operatorFinalRetainedAcknowledgementReceiptId,
                sanitizedFinalRetainedCompletionIndexRef,
                productLogEvidenceRef,
                retainedCompletionAcknowledgementRef,
                indexStatus,
            }),
            operatorFinalRetainedAcknowledgementReceiptId,
            sanitizedFinalRetainedCompletionIndexRef,
            productLogEvidenceRef,
            retainedCompletionAcknowledgementRef,
            indexStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-completion-index.js.map