import { createHash } from "node:crypto";
const SAFE_FINAL_COMPLETION_LEDGER_REF_PATTERN = /^final-completion-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_COMPLETION_REF_PATTERN = /^final-completion:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorFinalCompletionReceiptId(receipt) {
    if (receipt.status !== "operator_final_completion_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorFinalCompletionReceiptId;
}
function buildFinalCompletionLedgerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorFinalCompletionReceiptId,
        input.sanitizedFinalCompletionLedgerRef,
        input.productLogEvidenceRef,
        input.finalCompletionRef,
        input.ledgerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-completion-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-completion-ledger.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalCompletionLedger(input) {
    const blockingReasonCodes = [];
    const operatorFinalCompletionReceiptId = extractOperatorFinalCompletionReceiptId(input.operatorFinalCompletionReceipt);
    if (operatorFinalCompletionReceiptId === undefined) {
        blockingReasonCodes.push("final_completion_ledger_receipt_not_ready");
    }
    const sanitizedFinalCompletionLedgerRef = input.sanitizedFinalCompletionLedgerRef.trim();
    if (!SAFE_FINAL_COMPLETION_LEDGER_REF_PATTERN.test(sanitizedFinalCompletionLedgerRef)) {
        blockingReasonCodes.push("final_completion_ledger_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_completion_ledger_product_log_evidence_ref_invalid");
    }
    const finalCompletionRef = input.finalCompletionRef.trim();
    if (!SAFE_FINAL_COMPLETION_REF_PATTERN.test(finalCompletionRef)) {
        blockingReasonCodes.push("final_completion_ledger_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 ||
        operatorFinalCompletionReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_completion_ledger_blocked",
            blockingReasonCodes,
        });
    }
    const ledgerStatus = "ready";
    return baseResult({
        status: "final_completion_ledger_ready",
        reasonCode: "active_tab_info_final_completion_ledger_ready",
        ledger: Object.freeze({
            finalCompletionLedgerId: buildFinalCompletionLedgerId({
                operatorFinalCompletionReceiptId,
                sanitizedFinalCompletionLedgerRef,
                productLogEvidenceRef,
                finalCompletionRef,
                ledgerStatus,
            }),
            operatorFinalCompletionReceiptId,
            sanitizedFinalCompletionLedgerRef,
            productLogEvidenceRef,
            finalCompletionRef,
            ledgerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-completion-ledger.js.map