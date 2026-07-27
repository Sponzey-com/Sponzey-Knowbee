import { createHash } from "node:crypto";
const SAFE_FINAL_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN = /^final-acknowledgement-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_ACKNOWLEDGEMENT_REF_PATTERN = /^final-acknowledgement:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorFinalAcknowledgementReceiptId(receipt) {
    if (receipt.status !== "operator_final_acknowledgement_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorFinalAcknowledgementReceiptId;
}
function buildFinalAcknowledgementLedgerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorFinalAcknowledgementReceiptId,
        input.sanitizedFinalAcknowledgementLedgerRef,
        input.productLogEvidenceRef,
        input.finalAcknowledgementRef,
        input.ledgerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-acknowledgement-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-acknowledgement-ledger.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalAcknowledgementLedger(input) {
    const blockingReasonCodes = [];
    const operatorFinalAcknowledgementReceiptId = extractOperatorFinalAcknowledgementReceiptId(input.operatorFinalAcknowledgementReceipt);
    if (operatorFinalAcknowledgementReceiptId === undefined) {
        blockingReasonCodes.push("final_acknowledgement_ledger_receipt_not_ready");
    }
    const sanitizedFinalAcknowledgementLedgerRef = input.sanitizedFinalAcknowledgementLedgerRef.trim();
    if (!SAFE_FINAL_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN.test(sanitizedFinalAcknowledgementLedgerRef)) {
        blockingReasonCodes.push("final_acknowledgement_ledger_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_acknowledgement_ledger_product_log_evidence_ref_invalid");
    }
    const finalAcknowledgementRef = input.finalAcknowledgementRef.trim();
    if (!SAFE_FINAL_ACKNOWLEDGEMENT_REF_PATTERN.test(finalAcknowledgementRef)) {
        blockingReasonCodes.push("final_acknowledgement_ledger_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        operatorFinalAcknowledgementReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_acknowledgement_ledger_blocked",
            blockingReasonCodes,
        });
    }
    const ledgerStatus = "ready";
    return baseResult({
        status: "final_acknowledgement_ledger_ready",
        reasonCode: "active_tab_info_final_acknowledgement_ledger_ready",
        ledger: Object.freeze({
            finalAcknowledgementLedgerId: buildFinalAcknowledgementLedgerId({
                operatorFinalAcknowledgementReceiptId,
                sanitizedFinalAcknowledgementLedgerRef,
                productLogEvidenceRef,
                finalAcknowledgementRef,
                ledgerStatus,
            }),
            operatorFinalAcknowledgementReceiptId,
            sanitizedFinalAcknowledgementLedgerRef,
            productLogEvidenceRef,
            finalAcknowledgementRef,
            ledgerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-acknowledgement-ledger.js.map