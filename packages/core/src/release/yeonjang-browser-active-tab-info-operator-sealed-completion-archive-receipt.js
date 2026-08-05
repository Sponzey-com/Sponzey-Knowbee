import { createHash } from "node:crypto";
const SAFE_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT_REF_PATTERN = /^operator-sealed-completion-archive-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT_ACK_REF_PATTERN = /^operator-sealed-completion-archive:active-tab-info:receipt:[a-z0-9._:-]+$/u;
function extractFinalCompletionArchiveSealId(seal) {
    if (seal.status !== "final_completion_archive_seal_ready" ||
        seal.seal === undefined) {
        return undefined;
    }
    return seal.seal.finalCompletionArchiveSealId;
}
function buildOperatorSealedCompletionArchiveReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalCompletionArchiveSealId,
        input.sanitizedOperatorSealedCompletionArchiveReceiptRef,
        input.productLogEvidenceRef,
        input.operatorSealedCompletionArchiveReceiptRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-sealed-completion-archive-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt(input) {
    const blockingReasonCodes = [];
    const finalCompletionArchiveSealId = extractFinalCompletionArchiveSealId(input.finalCompletionArchiveSeal);
    if (finalCompletionArchiveSealId === undefined) {
        blockingReasonCodes.push("operator_sealed_completion_archive_receipt_seal_not_ready");
    }
    const sanitizedOperatorSealedCompletionArchiveReceiptRef = input.sanitizedOperatorSealedCompletionArchiveReceiptRef.trim();
    if (!SAFE_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT_REF_PATTERN.test(sanitizedOperatorSealedCompletionArchiveReceiptRef)) {
        blockingReasonCodes.push("operator_sealed_completion_archive_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_sealed_completion_archive_receipt_product_log_evidence_ref_invalid");
    }
    const operatorSealedCompletionArchiveReceiptRef = input.operatorSealedCompletionArchiveReceiptRef.trim();
    if (!SAFE_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT_ACK_REF_PATTERN.test(operatorSealedCompletionArchiveReceiptRef)) {
        blockingReasonCodes.push("operator_sealed_completion_archive_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || finalCompletionArchiveSealId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_sealed_completion_archive_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_sealed_completion_archive_receipt_ready",
        reasonCode: "active_tab_info_operator_sealed_completion_archive_receipt_ready",
        receipt: Object.freeze({
            operatorSealedCompletionArchiveReceiptId: buildOperatorSealedCompletionArchiveReceiptId({
                finalCompletionArchiveSealId,
                sanitizedOperatorSealedCompletionArchiveReceiptRef,
                productLogEvidenceRef,
                operatorSealedCompletionArchiveReceiptRef,
                receiptStatus,
            }),
            finalCompletionArchiveSealId,
            sanitizedOperatorSealedCompletionArchiveReceiptRef,
            productLogEvidenceRef,
            operatorSealedCompletionArchiveReceiptRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.js.map