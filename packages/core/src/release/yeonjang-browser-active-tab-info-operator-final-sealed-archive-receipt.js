import { createHash } from "node:crypto";
const SAFE_OPERATOR_FINAL_SEALED_ARCHIVE_RECEIPT_REF_PATTERN = /^operator-final-sealed-archive-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_FINAL_SEALED_ARCHIVE_RECEIPT_ACK_REF_PATTERN = /^operator-final-sealed-archive:active-tab-info:receipt:[a-z0-9._:-]+$/u;
function extractFinalSealedArchiveHandoffCompletionIndexId(index) {
    if (index.status !== "final_sealed_archive_handoff_completion_index_ready" ||
        index.index === undefined) {
        return undefined;
    }
    return index.index.finalSealedArchiveHandoffCompletionIndexId;
}
function buildOperatorFinalSealedArchiveReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalSealedArchiveHandoffCompletionIndexId,
        input.sanitizedOperatorFinalSealedArchiveReceiptRef,
        input.productLogEvidenceRef,
        input.operatorFinalSealedArchiveReceiptRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-final-sealed-archive-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt(input) {
    const blockingReasonCodes = [];
    const finalSealedArchiveHandoffCompletionIndexId = extractFinalSealedArchiveHandoffCompletionIndexId(input.finalSealedArchiveHandoffCompletionIndex);
    if (finalSealedArchiveHandoffCompletionIndexId === undefined) {
        blockingReasonCodes.push("operator_final_sealed_archive_receipt_index_not_ready");
    }
    const sanitizedOperatorFinalSealedArchiveReceiptRef = input.sanitizedOperatorFinalSealedArchiveReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_SEALED_ARCHIVE_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalSealedArchiveReceiptRef)) {
        blockingReasonCodes.push("operator_final_sealed_archive_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_final_sealed_archive_receipt_product_log_evidence_ref_invalid");
    }
    const operatorFinalSealedArchiveReceiptRef = input.operatorFinalSealedArchiveReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_SEALED_ARCHIVE_RECEIPT_ACK_REF_PATTERN.test(operatorFinalSealedArchiveReceiptRef)) {
        blockingReasonCodes.push("operator_final_sealed_archive_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || finalSealedArchiveHandoffCompletionIndexId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_final_sealed_archive_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_final_sealed_archive_receipt_ready",
        reasonCode: "active_tab_info_operator_final_sealed_archive_receipt_ready",
        receipt: Object.freeze({
            operatorFinalSealedArchiveReceiptId: buildOperatorFinalSealedArchiveReceiptId({
                finalSealedArchiveHandoffCompletionIndexId,
                sanitizedOperatorFinalSealedArchiveReceiptRef,
                productLogEvidenceRef,
                operatorFinalSealedArchiveReceiptRef,
                receiptStatus,
            }),
            finalSealedArchiveHandoffCompletionIndexId,
            sanitizedOperatorFinalSealedArchiveReceiptRef,
            productLogEvidenceRef,
            operatorFinalSealedArchiveReceiptRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.js.map