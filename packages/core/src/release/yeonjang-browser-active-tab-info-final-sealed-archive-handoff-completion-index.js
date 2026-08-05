import { createHash } from "node:crypto";
const SAFE_FINAL_SEALED_ARCHIVE_HANDOFF_COMPLETION_INDEX_REF_PATTERN = /^final-sealed-archive-handoff-completion-index:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_SEALED_ARCHIVE_HANDOFF_COMPLETION_ACK_REF_PATTERN = /^final-sealed-archive-handoff-completion:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorSealedArchiveHandoffReceiptId(receipt) {
    if (receipt.status !== "operator_sealed_archive_handoff_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorSealedArchiveHandoffReceiptId;
}
function buildFinalSealedArchiveHandoffCompletionIndexId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorSealedArchiveHandoffReceiptId,
        input.sanitizedFinalSealedArchiveHandoffCompletionIndexRef,
        input.productLogEvidenceRef,
        input.finalSealedArchiveHandoffCompletionAcknowledgementRef,
        input.indexStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-sealed-archive-handoff-completion-index:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-handoff-completion-index.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex(input) {
    const blockingReasonCodes = [];
    const operatorSealedArchiveHandoffReceiptId = extractOperatorSealedArchiveHandoffReceiptId(input.operatorSealedArchiveHandoffReceipt);
    if (operatorSealedArchiveHandoffReceiptId === undefined) {
        blockingReasonCodes.push("final_sealed_archive_handoff_completion_index_receipt_not_ready");
    }
    const sanitizedFinalSealedArchiveHandoffCompletionIndexRef = input.sanitizedFinalSealedArchiveHandoffCompletionIndexRef.trim();
    if (!SAFE_FINAL_SEALED_ARCHIVE_HANDOFF_COMPLETION_INDEX_REF_PATTERN.test(sanitizedFinalSealedArchiveHandoffCompletionIndexRef)) {
        blockingReasonCodes.push("final_sealed_archive_handoff_completion_index_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_sealed_archive_handoff_completion_index_product_log_evidence_ref_invalid");
    }
    const finalSealedArchiveHandoffCompletionAcknowledgementRef = input.finalSealedArchiveHandoffCompletionAcknowledgementRef.trim();
    if (!SAFE_FINAL_SEALED_ARCHIVE_HANDOFF_COMPLETION_ACK_REF_PATTERN.test(finalSealedArchiveHandoffCompletionAcknowledgementRef)) {
        blockingReasonCodes.push("final_sealed_archive_handoff_completion_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || operatorSealedArchiveHandoffReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_sealed_archive_handoff_completion_index_blocked",
            blockingReasonCodes,
        });
    }
    const indexStatus = "ready";
    return baseResult({
        status: "final_sealed_archive_handoff_completion_index_ready",
        reasonCode: "active_tab_info_final_sealed_archive_handoff_completion_index_ready",
        index: Object.freeze({
            finalSealedArchiveHandoffCompletionIndexId: buildFinalSealedArchiveHandoffCompletionIndexId({
                operatorSealedArchiveHandoffReceiptId,
                sanitizedFinalSealedArchiveHandoffCompletionIndexRef,
                productLogEvidenceRef,
                finalSealedArchiveHandoffCompletionAcknowledgementRef,
                indexStatus,
            }),
            operatorSealedArchiveHandoffReceiptId,
            sanitizedFinalSealedArchiveHandoffCompletionIndexRef,
            productLogEvidenceRef,
            finalSealedArchiveHandoffCompletionAcknowledgementRef,
            indexStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-sealed-archive-handoff-completion-index.js.map