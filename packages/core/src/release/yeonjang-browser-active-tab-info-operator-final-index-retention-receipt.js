import { createHash } from "node:crypto";
const SAFE_OPERATOR_FINAL_INDEX_RETENTION_RECEIPT_REF_PATTERN = /^operator-final-index-retention-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_FINAL_INDEX_RETENTION_RECEIPT_ACK_REF_PATTERN = /^operator-final-index-retention:active-tab-info:receipt:[a-z0-9._:-]+$/u;
function extractFinalOperatorCloseoutIndexId(index) {
    if (index.status !== "final_operator_closeout_index_ready" ||
        index.index === undefined) {
        return undefined;
    }
    return index.index.finalOperatorCloseoutIndexId;
}
function buildOperatorFinalIndexRetentionReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalOperatorCloseoutIndexId,
        input.sanitizedOperatorFinalIndexRetentionReceiptRef,
        input.productLogEvidenceRef,
        input.operatorFinalIndexRetentionReceiptRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-final-index-retention-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt(input) {
    const blockingReasonCodes = [];
    const finalOperatorCloseoutIndexId = extractFinalOperatorCloseoutIndexId(input.finalOperatorCloseoutIndex);
    if (finalOperatorCloseoutIndexId === undefined) {
        blockingReasonCodes.push("operator_final_index_retention_receipt_index_not_ready");
    }
    const sanitizedOperatorFinalIndexRetentionReceiptRef = input.sanitizedOperatorFinalIndexRetentionReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_INDEX_RETENTION_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalIndexRetentionReceiptRef)) {
        blockingReasonCodes.push("operator_final_index_retention_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_final_index_retention_receipt_product_log_evidence_ref_invalid");
    }
    const operatorFinalIndexRetentionReceiptRef = input.operatorFinalIndexRetentionReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_INDEX_RETENTION_RECEIPT_ACK_REF_PATTERN.test(operatorFinalIndexRetentionReceiptRef)) {
        blockingReasonCodes.push("operator_final_index_retention_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || finalOperatorCloseoutIndexId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_final_index_retention_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_final_index_retention_receipt_ready",
        reasonCode: "active_tab_info_operator_final_index_retention_receipt_ready",
        receipt: Object.freeze({
            operatorFinalIndexRetentionReceiptId: buildOperatorFinalIndexRetentionReceiptId({
                finalOperatorCloseoutIndexId,
                sanitizedOperatorFinalIndexRetentionReceiptRef,
                productLogEvidenceRef,
                operatorFinalIndexRetentionReceiptRef,
                receiptStatus,
            }),
            finalOperatorCloseoutIndexId,
            sanitizedOperatorFinalIndexRetentionReceiptRef,
            productLogEvidenceRef,
            operatorFinalIndexRetentionReceiptRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.js.map