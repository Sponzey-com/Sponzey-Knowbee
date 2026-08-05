import { createHash } from "node:crypto";
const SAFE_OPERATOR_FINAL_RETAINED_SEALED_COMPLETION_RECEIPT_REF_PATTERN = /^operator-final-retained-sealed-completion-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_FINAL_RETAINED_SEALED_COMPLETION_REF_PATTERN = /^operator-final-retained-sealed-completion:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalRetainedSealedCloseoutCompletionLedgerId(ledger) {
    if (ledger.status !== "final_retained_sealed_closeout_completion_ledger_ready" ||
        ledger.ledger === undefined) {
        return undefined;
    }
    return ledger.ledger.finalRetainedSealedCloseoutCompletionLedgerId;
}
function buildOperatorFinalRetainedSealedCompletionReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalRetainedSealedCloseoutCompletionLedgerId,
        input.sanitizedOperatorFinalRetainedSealedCompletionReceiptRef,
        input.productLogEvidenceRef,
        input.operatorFinalRetainedSealedCompletionRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-final-retained-sealed-completion-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-sealed-completion-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt(input) {
    const blockingReasonCodes = [];
    const finalRetainedSealedCloseoutCompletionLedgerId = extractFinalRetainedSealedCloseoutCompletionLedgerId(input.finalRetainedSealedCloseoutCompletionLedger);
    if (finalRetainedSealedCloseoutCompletionLedgerId === undefined) {
        blockingReasonCodes.push("operator_final_retained_sealed_completion_receipt_ledger_not_ready");
    }
    const sanitizedOperatorFinalRetainedSealedCompletionReceiptRef = input.sanitizedOperatorFinalRetainedSealedCompletionReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_RETAINED_SEALED_COMPLETION_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedSealedCompletionReceiptRef)) {
        blockingReasonCodes.push("operator_final_retained_sealed_completion_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_final_retained_sealed_completion_receipt_product_log_evidence_ref_invalid");
    }
    const operatorFinalRetainedSealedCompletionRef = input.operatorFinalRetainedSealedCompletionRef.trim();
    if (!SAFE_OPERATOR_FINAL_RETAINED_SEALED_COMPLETION_REF_PATTERN.test(operatorFinalRetainedSealedCompletionRef)) {
        blockingReasonCodes.push("operator_final_retained_sealed_completion_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        finalRetainedSealedCloseoutCompletionLedgerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_final_retained_sealed_completion_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_final_retained_sealed_completion_receipt_ready",
        reasonCode: "active_tab_info_operator_final_retained_sealed_completion_receipt_ready",
        receipt: Object.freeze({
            operatorFinalRetainedSealedCompletionReceiptId: buildOperatorFinalRetainedSealedCompletionReceiptId({
                finalRetainedSealedCloseoutCompletionLedgerId,
                sanitizedOperatorFinalRetainedSealedCompletionReceiptRef,
                productLogEvidenceRef,
                operatorFinalRetainedSealedCompletionRef,
                receiptStatus,
            }),
            finalRetainedSealedCloseoutCompletionLedgerId,
            sanitizedOperatorFinalRetainedSealedCompletionReceiptRef,
            productLogEvidenceRef,
            operatorFinalRetainedSealedCompletionRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-sealed-completion-receipt.js.map