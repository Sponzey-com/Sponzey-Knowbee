import { createHash } from "node:crypto";
const SAFE_FINAL_RETENTION_CLOSURE_LEDGER_REF_PATTERN = /^final-retention-closure-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_RETENTION_CLOSURE_ACK_REF_PATTERN = /^final-retention-closure:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorFinalIndexRetentionReceiptId(receipt) {
    if (receipt.status !== "operator_final_index_retention_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorFinalIndexRetentionReceiptId;
}
function buildFinalRetentionClosureLedgerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorFinalIndexRetentionReceiptId,
        input.sanitizedFinalRetentionClosureLedgerRef,
        input.productLogEvidenceRef,
        input.finalRetentionClosureAcknowledgementRef,
        input.ledgerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-retention-closure-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retention-closure-ledger.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalRetentionClosureLedger(input) {
    const blockingReasonCodes = [];
    const operatorFinalIndexRetentionReceiptId = extractOperatorFinalIndexRetentionReceiptId(input.operatorFinalIndexRetentionReceipt);
    if (operatorFinalIndexRetentionReceiptId === undefined) {
        blockingReasonCodes.push("final_retention_closure_ledger_receipt_not_ready");
    }
    const sanitizedFinalRetentionClosureLedgerRef = input.sanitizedFinalRetentionClosureLedgerRef.trim();
    if (!SAFE_FINAL_RETENTION_CLOSURE_LEDGER_REF_PATTERN.test(sanitizedFinalRetentionClosureLedgerRef)) {
        blockingReasonCodes.push("final_retention_closure_ledger_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_retention_closure_ledger_product_log_evidence_ref_invalid");
    }
    const finalRetentionClosureAcknowledgementRef = input.finalRetentionClosureAcknowledgementRef.trim();
    if (!SAFE_FINAL_RETENTION_CLOSURE_ACK_REF_PATTERN.test(finalRetentionClosureAcknowledgementRef)) {
        blockingReasonCodes.push("final_retention_closure_ledger_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || operatorFinalIndexRetentionReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_retention_closure_ledger_blocked",
            blockingReasonCodes,
        });
    }
    const ledgerStatus = "ready";
    return baseResult({
        status: "final_retention_closure_ledger_ready",
        reasonCode: "active_tab_info_final_retention_closure_ledger_ready",
        ledger: Object.freeze({
            finalRetentionClosureLedgerId: buildFinalRetentionClosureLedgerId({
                operatorFinalIndexRetentionReceiptId,
                sanitizedFinalRetentionClosureLedgerRef,
                productLogEvidenceRef,
                finalRetentionClosureAcknowledgementRef,
                ledgerStatus,
            }),
            operatorFinalIndexRetentionReceiptId,
            sanitizedFinalRetentionClosureLedgerRef,
            productLogEvidenceRef,
            finalRetentionClosureAcknowledgementRef,
            ledgerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retention-closure-ledger.js.map