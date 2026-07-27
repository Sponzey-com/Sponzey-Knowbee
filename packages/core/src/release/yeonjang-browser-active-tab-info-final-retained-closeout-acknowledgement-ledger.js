import { createHash } from "node:crypto";
const SAFE_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN = /^final-retained-closeout-acknowledgement-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN = /^final-retained-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorRetainedCloseoutAcknowledgementReceiptId(receipt) {
    if (receipt.status !== "operator_retained_closeout_acknowledgement_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorRetainedCloseoutAcknowledgementReceiptId;
}
function buildFinalRetainedCloseoutAcknowledgementLedgerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorRetainedCloseoutAcknowledgementReceiptId,
        input.sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef,
        input.productLogEvidenceRef,
        input.finalRetainedCloseoutAcknowledgementRef,
        input.ledgerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-retained-closeout-acknowledgement-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger(input) {
    const blockingReasonCodes = [];
    const operatorRetainedCloseoutAcknowledgementReceiptId = extractOperatorRetainedCloseoutAcknowledgementReceiptId(input.operatorRetainedCloseoutAcknowledgementReceipt);
    if (operatorRetainedCloseoutAcknowledgementReceiptId === undefined) {
        blockingReasonCodes.push("final_retained_closeout_acknowledgement_ledger_receipt_not_ready");
    }
    const sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef = input.sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef.trim();
    if (!SAFE_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef)) {
        blockingReasonCodes.push("final_retained_closeout_acknowledgement_ledger_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_retained_closeout_acknowledgement_ledger_product_log_evidence_ref_invalid");
    }
    const finalRetainedCloseoutAcknowledgementRef = input.finalRetainedCloseoutAcknowledgementRef.trim();
    if (!SAFE_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN.test(finalRetainedCloseoutAcknowledgementRef)) {
        blockingReasonCodes.push("final_retained_closeout_acknowledgement_ledger_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        operatorRetainedCloseoutAcknowledgementReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_retained_closeout_acknowledgement_ledger_blocked",
            blockingReasonCodes,
        });
    }
    const ledgerStatus = "ready";
    return baseResult({
        status: "final_retained_closeout_acknowledgement_ledger_ready",
        reasonCode: "active_tab_info_final_retained_closeout_acknowledgement_ledger_ready",
        ledger: Object.freeze({
            finalRetainedCloseoutAcknowledgementLedgerId: buildFinalRetainedCloseoutAcknowledgementLedgerId({
                operatorRetainedCloseoutAcknowledgementReceiptId,
                sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef,
                productLogEvidenceRef,
                finalRetainedCloseoutAcknowledgementRef,
                ledgerStatus,
            }),
            operatorRetainedCloseoutAcknowledgementReceiptId,
            sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef,
            productLogEvidenceRef,
            finalRetainedCloseoutAcknowledgementRef,
            ledgerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.js.map