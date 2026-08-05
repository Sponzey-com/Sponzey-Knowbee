import { createHash } from "node:crypto";
const SAFE_OPERATOR_FINAL_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN = /^operator-final-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_FINAL_ACKNOWLEDGEMENT_REF_PATTERN = /^operator-final-acknowledgement:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalCompletionLedgerId(ledger) {
    if (ledger.status !== "final_completion_ledger_ready" ||
        ledger.ledger === undefined) {
        return undefined;
    }
    return ledger.ledger.finalCompletionLedgerId;
}
function buildOperatorFinalAcknowledgementReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalCompletionLedgerId,
        input.sanitizedOperatorFinalAcknowledgementReceiptRef,
        input.productLogEvidenceRef,
        input.operatorFinalAcknowledgementRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-final-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-acknowledgement-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt(input) {
    const blockingReasonCodes = [];
    const finalCompletionLedgerId = extractFinalCompletionLedgerId(input.finalCompletionLedger);
    if (finalCompletionLedgerId === undefined) {
        blockingReasonCodes.push("operator_final_acknowledgement_receipt_ledger_not_ready");
    }
    const sanitizedOperatorFinalAcknowledgementReceiptRef = input.sanitizedOperatorFinalAcknowledgementReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalAcknowledgementReceiptRef)) {
        blockingReasonCodes.push("operator_final_acknowledgement_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_final_acknowledgement_receipt_product_log_evidence_ref_invalid");
    }
    const operatorFinalAcknowledgementRef = input.operatorFinalAcknowledgementRef.trim();
    if (!SAFE_OPERATOR_FINAL_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorFinalAcknowledgementRef)) {
        blockingReasonCodes.push("operator_final_acknowledgement_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        finalCompletionLedgerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_final_acknowledgement_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_final_acknowledgement_receipt_ready",
        reasonCode: "active_tab_info_operator_final_acknowledgement_receipt_ready",
        receipt: Object.freeze({
            operatorFinalAcknowledgementReceiptId: buildOperatorFinalAcknowledgementReceiptId({
                finalCompletionLedgerId,
                sanitizedOperatorFinalAcknowledgementReceiptRef,
                productLogEvidenceRef,
                operatorFinalAcknowledgementRef,
                receiptStatus,
            }),
            finalCompletionLedgerId,
            sanitizedOperatorFinalAcknowledgementReceiptRef,
            productLogEvidenceRef,
            operatorFinalAcknowledgementRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-acknowledgement-receipt.js.map