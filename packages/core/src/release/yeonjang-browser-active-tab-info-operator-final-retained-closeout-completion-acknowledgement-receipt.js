import { createHash } from "node:crypto";
const SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN = /^operator-final-retained-closeout-completion-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN = /^operator-final-retained-closeout-completion:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalRetainedCloseoutCompletionLedgerId(ledger) {
    if (ledger.status !== "final_retained_closeout_completion_ledger_ready" ||
        ledger.ledger === undefined) {
        return undefined;
    }
    return ledger.ledger.finalRetainedCloseoutCompletionLedgerId;
}
function buildOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalRetainedCloseoutCompletionLedgerId,
        input.sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef,
        input.productLogEvidenceRef,
        input.operatorFinalRetainedCloseoutCompletionAcknowledgementRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-final-retained-closeout-completion-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt(input) {
    const blockingReasonCodes = [];
    const finalRetainedCloseoutCompletionLedgerId = extractFinalRetainedCloseoutCompletionLedgerId(input.finalRetainedCloseoutCompletionLedger);
    if (finalRetainedCloseoutCompletionLedgerId === undefined) {
        blockingReasonCodes.push("operator_final_retained_closeout_completion_acknowledgement_receipt_ledger_not_ready");
    }
    const sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef = input.sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef)) {
        blockingReasonCodes.push("operator_final_retained_closeout_completion_acknowledgement_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_final_retained_closeout_completion_acknowledgement_receipt_product_log_evidence_ref_invalid");
    }
    const operatorFinalRetainedCloseoutCompletionAcknowledgementRef = input.operatorFinalRetainedCloseoutCompletionAcknowledgementRef.trim();
    if (!SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorFinalRetainedCloseoutCompletionAcknowledgementRef)) {
        blockingReasonCodes.push("operator_final_retained_closeout_completion_acknowledgement_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        finalRetainedCloseoutCompletionLedgerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_final_retained_closeout_completion_acknowledgement_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_final_retained_closeout_completion_acknowledgement_receipt_ready",
        reasonCode: "active_tab_info_operator_final_retained_closeout_completion_acknowledgement_receipt_ready",
        receipt: Object.freeze({
            operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId: buildOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId({
                finalRetainedCloseoutCompletionLedgerId,
                sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef,
                productLogEvidenceRef,
                operatorFinalRetainedCloseoutCompletionAcknowledgementRef,
                receiptStatus,
            }),
            finalRetainedCloseoutCompletionLedgerId,
            sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef,
            productLogEvidenceRef,
            operatorFinalRetainedCloseoutCompletionAcknowledgementRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt.js.map