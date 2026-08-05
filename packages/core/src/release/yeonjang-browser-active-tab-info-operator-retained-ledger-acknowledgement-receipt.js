import { createHash } from "node:crypto";
const SAFE_OPERATOR_RETAINED_LEDGER_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN = /^operator-retained-ledger-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_RETAINED_LEDGER_ACKNOWLEDGEMENT_REF_PATTERN = /^operator-retained-ledger:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalRetainedCompletionAcknowledgementLedgerId(ledger) {
    if (ledger.status !== "final_retained_completion_acknowledgement_ledger_ready" ||
        ledger.ledger === undefined) {
        return undefined;
    }
    return ledger.ledger.finalRetainedCompletionAcknowledgementLedgerId;
}
function buildOperatorRetainedLedgerAcknowledgementReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalRetainedCompletionAcknowledgementLedgerId,
        input.sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef,
        input.productLogEvidenceRef,
        input.operatorRetainedLedgerAcknowledgementRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-retained-ledger-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-retained-ledger-acknowledgement-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt(input) {
    const blockingReasonCodes = [];
    const finalRetainedCompletionAcknowledgementLedgerId = extractFinalRetainedCompletionAcknowledgementLedgerId(input.finalRetainedCompletionAcknowledgementLedger);
    if (finalRetainedCompletionAcknowledgementLedgerId === undefined) {
        blockingReasonCodes.push("operator_retained_ledger_acknowledgement_receipt_ledger_not_ready");
    }
    const sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef = input.sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef.trim();
    if (!SAFE_OPERATOR_RETAINED_LEDGER_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef)) {
        blockingReasonCodes.push("operator_retained_ledger_acknowledgement_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_retained_ledger_acknowledgement_receipt_product_log_evidence_ref_invalid");
    }
    const operatorRetainedLedgerAcknowledgementRef = input.operatorRetainedLedgerAcknowledgementRef.trim();
    if (!SAFE_OPERATOR_RETAINED_LEDGER_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorRetainedLedgerAcknowledgementRef)) {
        blockingReasonCodes.push("operator_retained_ledger_acknowledgement_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        finalRetainedCompletionAcknowledgementLedgerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_retained_ledger_acknowledgement_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_retained_ledger_acknowledgement_receipt_ready",
        reasonCode: "active_tab_info_operator_retained_ledger_acknowledgement_receipt_ready",
        receipt: Object.freeze({
            operatorRetainedLedgerAcknowledgementReceiptId: buildOperatorRetainedLedgerAcknowledgementReceiptId({
                finalRetainedCompletionAcknowledgementLedgerId,
                sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef,
                productLogEvidenceRef,
                operatorRetainedLedgerAcknowledgementRef,
                receiptStatus,
            }),
            finalRetainedCompletionAcknowledgementLedgerId,
            sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef,
            productLogEvidenceRef,
            operatorRetainedLedgerAcknowledgementRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-retained-ledger-acknowledgement-receipt.js.map