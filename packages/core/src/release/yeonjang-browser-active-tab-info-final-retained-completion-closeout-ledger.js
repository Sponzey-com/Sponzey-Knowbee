import { createHash } from "node:crypto";
const SAFE_FINAL_RETAINED_COMPLETION_CLOSEOUT_LEDGER_REF_PATTERN = /^final-retained-completion-closeout-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_RETAINED_COMPLETION_CLOSEOUT_REF_PATTERN = /^final-retained-completion-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId(receipt) {
    if (receipt.status !==
        "operator_final_retained_closeout_completion_acknowledgement_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId;
}
function buildFinalRetainedCompletionCloseoutLedgerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId,
        input.sanitizedFinalRetainedCompletionCloseoutLedgerRef,
        input.productLogEvidenceRef,
        input.finalRetainedCompletionCloseoutRef,
        input.ledgerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-retained-completion-closeout-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-closeout-ledger.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.ledger === undefined ? {} : { ledger: input.ledger }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger(input) {
    const blockingReasonCodes = [];
    const operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId = extractOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId(input.operatorFinalRetainedCloseoutCompletionAcknowledgementReceipt);
    if (operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId === undefined) {
        blockingReasonCodes.push("final_retained_completion_closeout_ledger_receipt_not_ready");
    }
    const sanitizedFinalRetainedCompletionCloseoutLedgerRef = input.sanitizedFinalRetainedCompletionCloseoutLedgerRef.trim();
    if (!SAFE_FINAL_RETAINED_COMPLETION_CLOSEOUT_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedCompletionCloseoutLedgerRef)) {
        blockingReasonCodes.push("final_retained_completion_closeout_ledger_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_retained_completion_closeout_ledger_product_log_evidence_ref_invalid");
    }
    const finalRetainedCompletionCloseoutRef = input.finalRetainedCompletionCloseoutRef.trim();
    if (!SAFE_FINAL_RETAINED_COMPLETION_CLOSEOUT_REF_PATTERN.test(finalRetainedCompletionCloseoutRef)) {
        blockingReasonCodes.push("final_retained_completion_closeout_ledger_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_retained_completion_closeout_ledger_blocked",
            blockingReasonCodes,
        });
    }
    const ledgerStatus = "ready";
    return baseResult({
        status: "final_retained_completion_closeout_ledger_ready",
        reasonCode: "active_tab_info_final_retained_completion_closeout_ledger_ready",
        ledger: Object.freeze({
            finalRetainedCompletionCloseoutLedgerId: buildFinalRetainedCompletionCloseoutLedgerId({
                operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId,
                sanitizedFinalRetainedCompletionCloseoutLedgerRef,
                productLogEvidenceRef,
                finalRetainedCompletionCloseoutRef,
                ledgerStatus,
            }),
            operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId,
            sanitizedFinalRetainedCompletionCloseoutLedgerRef,
            productLogEvidenceRef,
            finalRetainedCompletionCloseoutRef,
            ledgerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-completion-closeout-ledger.js.map