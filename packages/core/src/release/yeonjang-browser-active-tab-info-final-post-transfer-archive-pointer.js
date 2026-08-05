import { createHash } from "node:crypto";
const SAFE_POST_TRANSFER_ARCHIVE_POINTER_REF_PATTERN = /^post-transfer-archive-pointer:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_ARCHIVE_TRANSFER_ACK_REF_PATTERN = /^archive-transfer:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorFinalTransferAcknowledgementReceiptId(receipt) {
    if (receipt.status !== "operator_final_transfer_acknowledgement_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorFinalTransferAcknowledgementReceiptId;
}
function buildFinalPostTransferArchivePointerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorFinalTransferAcknowledgementReceiptId,
        input.sanitizedPostTransferArchivePointerRef,
        input.productLogEvidenceRef,
        input.archiveTransferAcknowledgementRef,
        input.pointerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-post-transfer-archive-pointer:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.pointer === undefined ? {} : { pointer: input.pointer }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer(input) {
    const blockingReasonCodes = [];
    const operatorFinalTransferAcknowledgementReceiptId = extractOperatorFinalTransferAcknowledgementReceiptId(input.operatorFinalTransferAcknowledgementReceipt);
    if (operatorFinalTransferAcknowledgementReceiptId === undefined) {
        blockingReasonCodes.push("final_post_transfer_archive_pointer_receipt_not_ready");
    }
    const sanitizedPostTransferArchivePointerRef = input.sanitizedPostTransferArchivePointerRef.trim();
    if (!SAFE_POST_TRANSFER_ARCHIVE_POINTER_REF_PATTERN.test(sanitizedPostTransferArchivePointerRef)) {
        blockingReasonCodes.push("final_post_transfer_archive_pointer_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_post_transfer_archive_pointer_product_log_evidence_ref_invalid");
    }
    const archiveTransferAcknowledgementRef = input.archiveTransferAcknowledgementRef.trim();
    if (!SAFE_ARCHIVE_TRANSFER_ACK_REF_PATTERN.test(archiveTransferAcknowledgementRef)) {
        blockingReasonCodes.push("final_post_transfer_archive_pointer_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        operatorFinalTransferAcknowledgementReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_post_transfer_archive_pointer_blocked",
            blockingReasonCodes,
        });
    }
    const pointerStatus = "ready";
    return baseResult({
        status: "final_post_transfer_archive_pointer_ready",
        reasonCode: "active_tab_info_final_post_transfer_archive_pointer_ready",
        pointer: Object.freeze({
            finalPostTransferArchivePointerId: buildFinalPostTransferArchivePointerId({
                operatorFinalTransferAcknowledgementReceiptId,
                sanitizedPostTransferArchivePointerRef,
                productLogEvidenceRef,
                archiveTransferAcknowledgementRef,
                pointerStatus,
            }),
            operatorFinalTransferAcknowledgementReceiptId,
            sanitizedPostTransferArchivePointerRef,
            productLogEvidenceRef,
            archiveTransferAcknowledgementRef,
            pointerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.js.map