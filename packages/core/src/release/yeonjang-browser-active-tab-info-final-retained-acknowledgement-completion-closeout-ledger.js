import { createHash } from "node:crypto";
const SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_LEDGER_REF_PATTERN = /^final-retained-acknowledgement-completion-closeout-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_REF_PATTERN = /^final-retained-acknowledgement-completion-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId(receipt) {
    if (receipt.status !==
        "operator_final_retained_acknowledgement_completion_closeout_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId;
}
function buildFinalRetainedAcknowledgementCompletionCloseoutLedgerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId,
        input.sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef,
        input.productLogEvidenceRef,
        input.finalRetainedAcknowledgementCompletionCloseoutRef,
        input.ledgerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-retained-acknowledgement-completion-closeout-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-ledger.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedger(input) {
    const blockingReasonCodes = [];
    const operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId = extractOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId(input.operatorFinalRetainedAcknowledgementCompletionCloseoutReceipt);
    if (operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId === undefined) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_closeout_ledger_receipt_not_ready");
    }
    const sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef = input.sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef.trim();
    if (!SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef)) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_closeout_ledger_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_closeout_ledger_product_log_evidence_ref_invalid");
    }
    const finalRetainedAcknowledgementCompletionCloseoutRef = input.finalRetainedAcknowledgementCompletionCloseoutRef.trim();
    if (!SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_REF_PATTERN.test(finalRetainedAcknowledgementCompletionCloseoutRef)) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_closeout_ledger_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_retained_acknowledgement_completion_closeout_ledger_blocked",
            blockingReasonCodes,
        });
    }
    const ledgerStatus = "ready";
    return baseResult({
        status: "final_retained_acknowledgement_completion_closeout_ledger_ready",
        reasonCode: "active_tab_info_final_retained_acknowledgement_completion_closeout_ledger_ready",
        ledger: Object.freeze({
            finalRetainedAcknowledgementCompletionCloseoutLedgerId: buildFinalRetainedAcknowledgementCompletionCloseoutLedgerId({
                operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId,
                sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef,
                productLogEvidenceRef,
                finalRetainedAcknowledgementCompletionCloseoutRef,
                ledgerStatus,
            }),
            operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId,
            sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef,
            productLogEvidenceRef,
            finalRetainedAcknowledgementCompletionCloseoutRef,
            ledgerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-ledger.js.map