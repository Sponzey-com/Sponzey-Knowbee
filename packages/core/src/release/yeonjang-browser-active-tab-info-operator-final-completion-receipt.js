import { createHash } from "node:crypto";
const SAFE_OPERATOR_FINAL_COMPLETION_RECEIPT_REF_PATTERN = /^operator-final-completion-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_FINAL_COMPLETION_REF_PATTERN = /^operator-final-completion:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalRetainedCompletionLedgerId(ledger) {
    if (ledger.status !== "final_retained_completion_ledger_ready" ||
        ledger.ledger === undefined) {
        return undefined;
    }
    return ledger.ledger.finalRetainedCompletionLedgerId;
}
function buildOperatorFinalCompletionReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalRetainedCompletionLedgerId,
        input.sanitizedOperatorFinalCompletionReceiptRef,
        input.productLogEvidenceRef,
        input.operatorFinalCompletionRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-final-completion-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-completion-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt(input) {
    const blockingReasonCodes = [];
    const finalRetainedCompletionLedgerId = extractFinalRetainedCompletionLedgerId(input.finalRetainedCompletionLedger);
    if (finalRetainedCompletionLedgerId === undefined) {
        blockingReasonCodes.push("operator_final_completion_receipt_ledger_not_ready");
    }
    const sanitizedOperatorFinalCompletionReceiptRef = input.sanitizedOperatorFinalCompletionReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_COMPLETION_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalCompletionReceiptRef)) {
        blockingReasonCodes.push("operator_final_completion_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_final_completion_receipt_product_log_evidence_ref_invalid");
    }
    const operatorFinalCompletionRef = input.operatorFinalCompletionRef.trim();
    if (!SAFE_OPERATOR_FINAL_COMPLETION_REF_PATTERN.test(operatorFinalCompletionRef)) {
        blockingReasonCodes.push("operator_final_completion_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        finalRetainedCompletionLedgerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_final_completion_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_final_completion_receipt_ready",
        reasonCode: "active_tab_info_operator_final_completion_receipt_ready",
        receipt: Object.freeze({
            operatorFinalCompletionReceiptId: buildOperatorFinalCompletionReceiptId({
                finalRetainedCompletionLedgerId,
                sanitizedOperatorFinalCompletionReceiptRef,
                productLogEvidenceRef,
                operatorFinalCompletionRef,
                receiptStatus,
            }),
            finalRetainedCompletionLedgerId,
            sanitizedOperatorFinalCompletionReceiptRef,
            productLogEvidenceRef,
            operatorFinalCompletionRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-completion-receipt.js.map