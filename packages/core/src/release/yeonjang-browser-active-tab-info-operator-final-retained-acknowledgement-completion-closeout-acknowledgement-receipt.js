import { createHash } from "node:crypto";
const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN = /^operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN = /^operator-final-retained-acknowledgement-completion-closeout-acknowledgement:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalRetainedAcknowledgementCompletionCloseoutLedgerId(ledger) {
    if (ledger.status !==
        "final_retained_acknowledgement_completion_closeout_ledger_ready" ||
        ledger.ledger === undefined) {
        return undefined;
    }
    return ledger.ledger.finalRetainedAcknowledgementCompletionCloseoutLedgerId;
}
function buildOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalRetainedAcknowledgementCompletionCloseoutLedgerId,
        input.sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptRef,
        input.productLogEvidenceRef,
        input.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt(input) {
    const blockingReasonCodes = [];
    const finalRetainedAcknowledgementCompletionCloseoutLedgerId = extractFinalRetainedAcknowledgementCompletionCloseoutLedgerId(input.finalRetainedAcknowledgementCompletionCloseoutLedger);
    if (finalRetainedAcknowledgementCompletionCloseoutLedgerId === undefined) {
        blockingReasonCodes.push("operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ledger_not_ready");
    }
    const sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptRef = input.sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptRef)) {
        blockingReasonCodes.push("operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid");
    }
    const operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef = input.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef.trim();
    if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef)) {
        blockingReasonCodes.push("operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        finalRetainedAcknowledgementCompletionCloseoutLedgerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ready",
        reasonCode: "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ready",
        receipt: Object.freeze({
            operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId: buildOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId({
                finalRetainedAcknowledgementCompletionCloseoutLedgerId,
                sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptRef,
                productLogEvidenceRef,
                operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef,
                receiptStatus,
            }),
            finalRetainedAcknowledgementCompletionCloseoutLedgerId,
            sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptRef,
            productLogEvidenceRef,
            operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt.js.map