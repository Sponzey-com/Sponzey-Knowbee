import { createHash } from "node:crypto";
const SAFE_FINAL_RETAINED_LEDGER_ACKNOWLEDGEMENT_SEAL_REF_PATTERN = /^final-retained-ledger-acknowledgement-seal:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_RETAINED_LEDGER_ACKNOWLEDGEMENT_REF_PATTERN = /^final-retained-ledger:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorRetainedLedgerAcknowledgementReceiptId(receipt) {
    if (receipt.status !== "operator_retained_ledger_acknowledgement_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorRetainedLedgerAcknowledgementReceiptId;
}
function buildFinalRetainedLedgerAcknowledgementSealId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorRetainedLedgerAcknowledgementReceiptId,
        input.sanitizedFinalRetainedLedgerAcknowledgementSealRef,
        input.productLogEvidenceRef,
        input.finalRetainedLedgerAcknowledgementRef,
        input.sealStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-retained-ledger-acknowledgement-seal:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-ledger-acknowledgement-seal.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.seal === undefined ? {} : { seal: input.seal }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal(input) {
    const blockingReasonCodes = [];
    const operatorRetainedLedgerAcknowledgementReceiptId = extractOperatorRetainedLedgerAcknowledgementReceiptId(input.operatorRetainedLedgerAcknowledgementReceipt);
    if (operatorRetainedLedgerAcknowledgementReceiptId === undefined) {
        blockingReasonCodes.push("final_retained_ledger_acknowledgement_seal_receipt_not_ready");
    }
    const sanitizedFinalRetainedLedgerAcknowledgementSealRef = input.sanitizedFinalRetainedLedgerAcknowledgementSealRef.trim();
    if (!SAFE_FINAL_RETAINED_LEDGER_ACKNOWLEDGEMENT_SEAL_REF_PATTERN.test(sanitizedFinalRetainedLedgerAcknowledgementSealRef)) {
        blockingReasonCodes.push("final_retained_ledger_acknowledgement_seal_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_retained_ledger_acknowledgement_seal_product_log_evidence_ref_invalid");
    }
    const finalRetainedLedgerAcknowledgementRef = input.finalRetainedLedgerAcknowledgementRef.trim();
    if (!SAFE_FINAL_RETAINED_LEDGER_ACKNOWLEDGEMENT_REF_PATTERN.test(finalRetainedLedgerAcknowledgementRef)) {
        blockingReasonCodes.push("final_retained_ledger_acknowledgement_seal_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        operatorRetainedLedgerAcknowledgementReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_retained_ledger_acknowledgement_seal_blocked",
            blockingReasonCodes,
        });
    }
    const sealStatus = "ready";
    return baseResult({
        status: "final_retained_ledger_acknowledgement_seal_ready",
        reasonCode: "active_tab_info_final_retained_ledger_acknowledgement_seal_ready",
        seal: Object.freeze({
            finalRetainedLedgerAcknowledgementSealId: buildFinalRetainedLedgerAcknowledgementSealId({
                operatorRetainedLedgerAcknowledgementReceiptId,
                sanitizedFinalRetainedLedgerAcknowledgementSealRef,
                productLogEvidenceRef,
                finalRetainedLedgerAcknowledgementRef,
                sealStatus,
            }),
            operatorRetainedLedgerAcknowledgementReceiptId,
            sanitizedFinalRetainedLedgerAcknowledgementSealRef,
            productLogEvidenceRef,
            finalRetainedLedgerAcknowledgementRef,
            sealStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-ledger-acknowledgement-seal.js.map