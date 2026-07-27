import { createHash } from "node:crypto";
const SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_LEDGER_REF_PATTERN = /^final-retained-acknowledgement-completion-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_REF_PATTERN = /^final-retained-acknowledgement-completion:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorFinalRetainedAcknowledgementCompletionReceiptId(receipt) {
    if (receipt.status !==
        "operator_final_retained_acknowledgement_completion_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorFinalRetainedAcknowledgementCompletionReceiptId;
}
function buildFinalRetainedAcknowledgementCompletionLedgerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorFinalRetainedAcknowledgementCompletionReceiptId,
        input.sanitizedFinalRetainedAcknowledgementCompletionLedgerRef,
        input.productLogEvidenceRef,
        input.finalRetainedAcknowledgementCompletionRef,
        input.ledgerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-retained-acknowledgement-completion-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger(input) {
    const blockingReasonCodes = [];
    const operatorFinalRetainedAcknowledgementCompletionReceiptId = extractOperatorFinalRetainedAcknowledgementCompletionReceiptId(input.operatorFinalRetainedAcknowledgementCompletionReceipt);
    if (operatorFinalRetainedAcknowledgementCompletionReceiptId === undefined) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_ledger_receipt_not_ready");
    }
    const sanitizedFinalRetainedAcknowledgementCompletionLedgerRef = input.sanitizedFinalRetainedAcknowledgementCompletionLedgerRef.trim();
    if (!SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedAcknowledgementCompletionLedgerRef)) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_ledger_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_ledger_product_log_evidence_ref_invalid");
    }
    const finalRetainedAcknowledgementCompletionRef = input.finalRetainedAcknowledgementCompletionRef.trim();
    if (!SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_REF_PATTERN.test(finalRetainedAcknowledgementCompletionRef)) {
        blockingReasonCodes.push("final_retained_acknowledgement_completion_ledger_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        operatorFinalRetainedAcknowledgementCompletionReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_retained_acknowledgement_completion_ledger_blocked",
            blockingReasonCodes,
        });
    }
    const ledgerStatus = "ready";
    return baseResult({
        status: "final_retained_acknowledgement_completion_ledger_ready",
        reasonCode: "active_tab_info_final_retained_acknowledgement_completion_ledger_ready",
        ledger: Object.freeze({
            finalRetainedAcknowledgementCompletionLedgerId: buildFinalRetainedAcknowledgementCompletionLedgerId({
                operatorFinalRetainedAcknowledgementCompletionReceiptId,
                sanitizedFinalRetainedAcknowledgementCompletionLedgerRef,
                productLogEvidenceRef,
                finalRetainedAcknowledgementCompletionRef,
                ledgerStatus,
            }),
            operatorFinalRetainedAcknowledgementCompletionReceiptId,
            sanitizedFinalRetainedAcknowledgementCompletionLedgerRef,
            productLogEvidenceRef,
            finalRetainedAcknowledgementCompletionRef,
            ledgerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.js.map