import { createHash } from "node:crypto";
const SAFE_OPERATOR_RETAINED_SEAL_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN = /^operator-retained-seal-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_RETAINED_SEAL_ACKNOWLEDGEMENT_REF_PATTERN = /^operator-retained-seal:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalRetainedLedgerAcknowledgementSealId(seal) {
    if (seal.status !== "final_retained_ledger_acknowledgement_seal_ready" ||
        seal.seal === undefined) {
        return undefined;
    }
    return seal.seal.finalRetainedLedgerAcknowledgementSealId;
}
function buildOperatorRetainedSealAcknowledgementReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalRetainedLedgerAcknowledgementSealId,
        input.sanitizedOperatorRetainedSealAcknowledgementReceiptRef,
        input.productLogEvidenceRef,
        input.operatorRetainedSealAcknowledgementRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-retained-seal-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt(input) {
    const blockingReasonCodes = [];
    const finalRetainedLedgerAcknowledgementSealId = extractFinalRetainedLedgerAcknowledgementSealId(input.finalRetainedLedgerAcknowledgementSeal);
    if (finalRetainedLedgerAcknowledgementSealId === undefined) {
        blockingReasonCodes.push("operator_retained_seal_acknowledgement_receipt_seal_not_ready");
    }
    const sanitizedOperatorRetainedSealAcknowledgementReceiptRef = input.sanitizedOperatorRetainedSealAcknowledgementReceiptRef.trim();
    if (!SAFE_OPERATOR_RETAINED_SEAL_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorRetainedSealAcknowledgementReceiptRef)) {
        blockingReasonCodes.push("operator_retained_seal_acknowledgement_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_retained_seal_acknowledgement_receipt_product_log_evidence_ref_invalid");
    }
    const operatorRetainedSealAcknowledgementRef = input.operatorRetainedSealAcknowledgementRef.trim();
    if (!SAFE_OPERATOR_RETAINED_SEAL_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorRetainedSealAcknowledgementRef)) {
        blockingReasonCodes.push("operator_retained_seal_acknowledgement_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        finalRetainedLedgerAcknowledgementSealId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_retained_seal_acknowledgement_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_retained_seal_acknowledgement_receipt_ready",
        reasonCode: "active_tab_info_operator_retained_seal_acknowledgement_receipt_ready",
        receipt: Object.freeze({
            operatorRetainedSealAcknowledgementReceiptId: buildOperatorRetainedSealAcknowledgementReceiptId({
                finalRetainedLedgerAcknowledgementSealId,
                sanitizedOperatorRetainedSealAcknowledgementReceiptRef,
                productLogEvidenceRef,
                operatorRetainedSealAcknowledgementRef,
                receiptStatus,
            }),
            finalRetainedLedgerAcknowledgementSealId,
            sanitizedOperatorRetainedSealAcknowledgementReceiptRef,
            productLogEvidenceRef,
            operatorRetainedSealAcknowledgementRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.js.map