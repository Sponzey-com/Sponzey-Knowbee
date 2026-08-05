import { createHash } from "node:crypto";
const SAFE_RETAINED_TRANSFER_INDEX_REF_PATTERN = /^retained-transfer-index:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_RETENTION_TRANSFER_ACKNOWLEDGEMENT_REF_PATTERN = /^retention-transfer:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorPostTransferArchiveAcknowledgementReceiptId(receipt) {
    if (receipt.status !==
        "operator_post_transfer_archive_acknowledgement_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorPostTransferArchiveAcknowledgementReceiptId;
}
function buildFinalRetainedTransferIndexId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorPostTransferArchiveAcknowledgementReceiptId,
        input.sanitizedRetainedTransferIndexRef,
        input.productLogEvidenceRef,
        input.retentionTransferAcknowledgementRef,
        input.indexStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-retained-transfer-index:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-transfer-index.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalRetainedTransferIndex(input) {
    const blockingReasonCodes = [];
    const operatorPostTransferArchiveAcknowledgementReceiptId = extractOperatorPostTransferArchiveAcknowledgementReceiptId(input.operatorPostTransferArchiveAcknowledgementReceipt);
    if (operatorPostTransferArchiveAcknowledgementReceiptId === undefined) {
        blockingReasonCodes.push("final_retained_transfer_index_receipt_not_ready");
    }
    const sanitizedRetainedTransferIndexRef = input.sanitizedRetainedTransferIndexRef.trim();
    if (!SAFE_RETAINED_TRANSFER_INDEX_REF_PATTERN.test(sanitizedRetainedTransferIndexRef)) {
        blockingReasonCodes.push("final_retained_transfer_index_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_retained_transfer_index_product_log_evidence_ref_invalid");
    }
    const retentionTransferAcknowledgementRef = input.retentionTransferAcknowledgementRef.trim();
    if (!SAFE_RETENTION_TRANSFER_ACKNOWLEDGEMENT_REF_PATTERN.test(retentionTransferAcknowledgementRef)) {
        blockingReasonCodes.push("final_retained_transfer_index_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        operatorPostTransferArchiveAcknowledgementReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_retained_transfer_index_blocked",
            blockingReasonCodes,
        });
    }
    const indexStatus = "ready";
    return baseResult({
        status: "final_retained_transfer_index_ready",
        reasonCode: "active_tab_info_final_retained_transfer_index_ready",
        index: Object.freeze({
            finalRetainedTransferIndexId: buildFinalRetainedTransferIndexId({
                operatorPostTransferArchiveAcknowledgementReceiptId,
                sanitizedRetainedTransferIndexRef,
                productLogEvidenceRef,
                retentionTransferAcknowledgementRef,
                indexStatus,
            }),
            operatorPostTransferArchiveAcknowledgementReceiptId,
            sanitizedRetainedTransferIndexRef,
            productLogEvidenceRef,
            retentionTransferAcknowledgementRef,
            indexStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-transfer-index.js.map