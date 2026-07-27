import { createHash } from "node:crypto";
const SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER_REF_PATTERN = /^final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_REF_PATTERN = /^final-retained-acknowledgement-completion-closeout-acknowledgement-closure:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId(receipt) {
    if (receipt.status !==
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId;
}
function buildFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId,
        input.sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef,
        input.productLogEvidenceRef,
        input.finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureRef,
        input.ledgerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger(input) {
    const blockingReasonCodes = [];
    const operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId = extractOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId(input.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt);
    if (operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId === undefined) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_not_ready");
    }
    const sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef = input.sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef.trim();
    if (!SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef)) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_product_log_evidence_ref_invalid");
    }
    const finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureRef = input.finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureRef.trim();
    if (!SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_REF_PATTERN.test(finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureRef)) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_blocked",
            blockingReasonCodes,
        });
    }
    const ledgerStatus = "ready";
    return baseResult({
        status: "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ready",
        reasonCode: "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ready",
        ledger: Object.freeze({
            finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId: buildFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId({
                operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId,
                sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef,
                productLogEvidenceRef,
                finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureRef,
                ledgerStatus,
            }),
            operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId,
            sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef,
            productLogEvidenceRef,
            finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureRef,
            ledgerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger.js.map