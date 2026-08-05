import { createHash } from "node:crypto";
const SAFE_ARCHIVE_INDEX_RETENTION_RECEIPT_REF_PATTERN = /^archive-index-retention-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_RETENTION_ACK_REF_PATTERN = /^operator-retention:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalReleaseArchiveIndexPointerId(pointer) {
    if (pointer.status !== "final_release_archive_index_pointer_ready" || pointer.pointer === undefined) {
        return undefined;
    }
    return pointer.pointer.finalReleaseArchiveIndexPointerId;
}
function buildOperatorArchiveIndexRetentionReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalReleaseArchiveIndexPointerId,
        input.sanitizedArchiveIndexRetentionReceiptRef,
        input.productLogEvidenceRef,
        input.operatorRetentionAcknowledgementRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-archive-index-retention-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt(input) {
    const blockingReasonCodes = [];
    const finalReleaseArchiveIndexPointerId = extractFinalReleaseArchiveIndexPointerId(input.finalReleaseArchiveIndexPointer);
    if (finalReleaseArchiveIndexPointerId === undefined) {
        blockingReasonCodes.push("operator_archive_index_retention_receipt_pointer_not_ready");
    }
    const sanitizedArchiveIndexRetentionReceiptRef = input.sanitizedArchiveIndexRetentionReceiptRef.trim();
    if (!SAFE_ARCHIVE_INDEX_RETENTION_RECEIPT_REF_PATTERN.test(sanitizedArchiveIndexRetentionReceiptRef)) {
        blockingReasonCodes.push("operator_archive_index_retention_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_archive_index_retention_receipt_product_log_evidence_ref_invalid");
    }
    const operatorRetentionAcknowledgementRef = input.operatorRetentionAcknowledgementRef.trim();
    if (!SAFE_OPERATOR_RETENTION_ACK_REF_PATTERN.test(operatorRetentionAcknowledgementRef)) {
        blockingReasonCodes.push("operator_archive_index_retention_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || finalReleaseArchiveIndexPointerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_archive_index_retention_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_archive_index_retention_receipt_ready",
        reasonCode: "active_tab_info_operator_archive_index_retention_receipt_ready",
        receipt: Object.freeze({
            operatorArchiveIndexRetentionReceiptId: buildOperatorArchiveIndexRetentionReceiptId({
                finalReleaseArchiveIndexPointerId,
                sanitizedArchiveIndexRetentionReceiptRef,
                productLogEvidenceRef,
                operatorRetentionAcknowledgementRef,
                receiptStatus,
            }),
            finalReleaseArchiveIndexPointerId,
            sanitizedArchiveIndexRetentionReceiptRef,
            productLogEvidenceRef,
            operatorRetentionAcknowledgementRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.js.map