import { createHash } from "node:crypto";
const SAFE_OPERATOR_FINAL_TRANSFER_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN = /^operator-final-transfer-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_FINAL_TRANSFER_ACKNOWLEDGEMENT_REF_PATTERN = /^operator-final-transfer:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalTransferCloseoutLedgerId(ledger) {
    if (ledger.status !== "final_transfer_closeout_ledger_ready" ||
        ledger.ledger === undefined) {
        return undefined;
    }
    return ledger.ledger.finalTransferCloseoutLedgerId;
}
function buildOperatorFinalTransferAcknowledgementReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalTransferCloseoutLedgerId,
        input.sanitizedOperatorFinalTransferAcknowledgementReceiptRef,
        input.productLogEvidenceRef,
        input.operatorFinalTransferAcknowledgementRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-final-transfer-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt(input) {
    const blockingReasonCodes = [];
    const finalTransferCloseoutLedgerId = extractFinalTransferCloseoutLedgerId(input.finalTransferCloseoutLedger);
    if (finalTransferCloseoutLedgerId === undefined) {
        blockingReasonCodes.push("operator_final_transfer_acknowledgement_receipt_ledger_not_ready");
    }
    const sanitizedOperatorFinalTransferAcknowledgementReceiptRef = input.sanitizedOperatorFinalTransferAcknowledgementReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_TRANSFER_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalTransferAcknowledgementReceiptRef)) {
        blockingReasonCodes.push("operator_final_transfer_acknowledgement_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_final_transfer_acknowledgement_receipt_product_log_evidence_ref_invalid");
    }
    const operatorFinalTransferAcknowledgementRef = input.operatorFinalTransferAcknowledgementRef.trim();
    if (!SAFE_OPERATOR_FINAL_TRANSFER_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorFinalTransferAcknowledgementRef)) {
        blockingReasonCodes.push("operator_final_transfer_acknowledgement_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || finalTransferCloseoutLedgerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_final_transfer_acknowledgement_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_final_transfer_acknowledgement_receipt_ready",
        reasonCode: "active_tab_info_operator_final_transfer_acknowledgement_receipt_ready",
        receipt: Object.freeze({
            operatorFinalTransferAcknowledgementReceiptId: buildOperatorFinalTransferAcknowledgementReceiptId({
                finalTransferCloseoutLedgerId,
                sanitizedOperatorFinalTransferAcknowledgementReceiptRef,
                productLogEvidenceRef,
                operatorFinalTransferAcknowledgementRef,
                receiptStatus,
            }),
            finalTransferCloseoutLedgerId,
            sanitizedOperatorFinalTransferAcknowledgementReceiptRef,
            productLogEvidenceRef,
            operatorFinalTransferAcknowledgementRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.js.map