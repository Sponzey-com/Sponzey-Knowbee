import { createHash } from "node:crypto";
const SAFE_OPERATOR_FINAL_RETAINED_COMPLETION_RECEIPT_REF_PATTERN = /^operator-final-retained-completion-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_FINAL_RETAINED_COMPLETION_REF_PATTERN = /^operator-final-retained-completion:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalRetainedSealedCompletionLedgerId(ledger) {
    if (ledger.status !== "final_retained_sealed_completion_ledger_ready" ||
        ledger.ledger === undefined) {
        return undefined;
    }
    return ledger.ledger.finalRetainedSealedCompletionLedgerId;
}
function buildOperatorFinalRetainedCompletionReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalRetainedSealedCompletionLedgerId,
        input.sanitizedOperatorFinalRetainedCompletionReceiptRef,
        input.productLogEvidenceRef,
        input.operatorFinalRetainedCompletionRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-final-retained-completion-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt(input) {
    const blockingReasonCodes = [];
    const finalRetainedSealedCompletionLedgerId = extractFinalRetainedSealedCompletionLedgerId(input.finalRetainedSealedCompletionLedger);
    if (finalRetainedSealedCompletionLedgerId === undefined) {
        blockingReasonCodes.push("operator_final_retained_completion_receipt_ledger_not_ready");
    }
    const sanitizedOperatorFinalRetainedCompletionReceiptRef = input.sanitizedOperatorFinalRetainedCompletionReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_RETAINED_COMPLETION_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedCompletionReceiptRef)) {
        blockingReasonCodes.push("operator_final_retained_completion_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_final_retained_completion_receipt_product_log_evidence_ref_invalid");
    }
    const operatorFinalRetainedCompletionRef = input.operatorFinalRetainedCompletionRef.trim();
    if (!SAFE_OPERATOR_FINAL_RETAINED_COMPLETION_REF_PATTERN.test(operatorFinalRetainedCompletionRef)) {
        blockingReasonCodes.push("operator_final_retained_completion_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        finalRetainedSealedCompletionLedgerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_final_retained_completion_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_final_retained_completion_receipt_ready",
        reasonCode: "active_tab_info_operator_final_retained_completion_receipt_ready",
        receipt: Object.freeze({
            operatorFinalRetainedCompletionReceiptId: buildOperatorFinalRetainedCompletionReceiptId({
                finalRetainedSealedCompletionLedgerId,
                sanitizedOperatorFinalRetainedCompletionReceiptRef,
                productLogEvidenceRef,
                operatorFinalRetainedCompletionRef,
                receiptStatus,
            }),
            finalRetainedSealedCompletionLedgerId,
            sanitizedOperatorFinalRetainedCompletionReceiptRef,
            productLogEvidenceRef,
            operatorFinalRetainedCompletionRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.js.map