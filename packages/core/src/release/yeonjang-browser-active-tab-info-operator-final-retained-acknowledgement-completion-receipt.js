import { createHash } from "node:crypto";
const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_RECEIPT_REF_PATTERN = /^operator-final-retained-acknowledgement-completion-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_REF_PATTERN = /^operator-final-retained-acknowledgement-completion:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalAcknowledgementLedgerId(ledger) {
    if (ledger.status !== "final_acknowledgement_ledger_ready" ||
        ledger.ledger === undefined) {
        return undefined;
    }
    return ledger.ledger.finalAcknowledgementLedgerId;
}
function buildOperatorFinalRetainedAcknowledgementCompletionReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalAcknowledgementLedgerId,
        input.sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef,
        input.productLogEvidenceRef,
        input.operatorFinalRetainedAcknowledgementCompletionRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-final-retained-acknowledgement-completion-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt(input) {
    const blockingReasonCodes = [];
    const finalAcknowledgementLedgerId = extractFinalAcknowledgementLedgerId(input.finalAcknowledgementLedger);
    if (finalAcknowledgementLedgerId === undefined) {
        blockingReasonCodes.push("operator_final_retained_acknowledgement_completion_receipt_ledger_not_ready");
    }
    const sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef = input.sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef)) {
        blockingReasonCodes.push("operator_final_retained_acknowledgement_completion_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_final_retained_acknowledgement_completion_receipt_product_log_evidence_ref_invalid");
    }
    const operatorFinalRetainedAcknowledgementCompletionRef = input.operatorFinalRetainedAcknowledgementCompletionRef.trim();
    if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_REF_PATTERN.test(operatorFinalRetainedAcknowledgementCompletionRef)) {
        blockingReasonCodes.push("operator_final_retained_acknowledgement_completion_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        finalAcknowledgementLedgerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_final_retained_acknowledgement_completion_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_final_retained_acknowledgement_completion_receipt_ready",
        reasonCode: "active_tab_info_operator_final_retained_acknowledgement_completion_receipt_ready",
        receipt: Object.freeze({
            operatorFinalRetainedAcknowledgementCompletionReceiptId: buildOperatorFinalRetainedAcknowledgementCompletionReceiptId({
                finalAcknowledgementLedgerId,
                sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef,
                productLogEvidenceRef,
                operatorFinalRetainedAcknowledgementCompletionRef,
                receiptStatus,
            }),
            finalAcknowledgementLedgerId,
            sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef,
            productLogEvidenceRef,
            operatorFinalRetainedAcknowledgementCompletionRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.js.map