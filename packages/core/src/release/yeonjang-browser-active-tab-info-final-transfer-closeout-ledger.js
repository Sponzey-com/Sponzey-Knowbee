import { createHash } from "node:crypto";
const SAFE_FINAL_TRANSFER_CLOSEOUT_LEDGER_REF_PATTERN = /^final-transfer-closeout-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_TRANSFER_CLOSEOUT_ACK_REF_PATTERN = /^final-transfer-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorFinalHandoffReceiptId(receipt) {
    if (receipt.status !== "operator_final_handoff_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorFinalHandoffReceiptId;
}
function buildFinalTransferCloseoutLedgerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorFinalHandoffReceiptId,
        input.sanitizedFinalTransferCloseoutLedgerRef,
        input.productLogEvidenceRef,
        input.finalTransferCloseoutAcknowledgementRef,
        input.ledgerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-transfer-closeout-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-transfer-closeout-ledger.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger(input) {
    const blockingReasonCodes = [];
    const operatorFinalHandoffReceiptId = extractOperatorFinalHandoffReceiptId(input.operatorFinalHandoffReceipt);
    if (operatorFinalHandoffReceiptId === undefined) {
        blockingReasonCodes.push("final_transfer_closeout_ledger_receipt_not_ready");
    }
    const sanitizedFinalTransferCloseoutLedgerRef = input.sanitizedFinalTransferCloseoutLedgerRef.trim();
    if (!SAFE_FINAL_TRANSFER_CLOSEOUT_LEDGER_REF_PATTERN.test(sanitizedFinalTransferCloseoutLedgerRef)) {
        blockingReasonCodes.push("final_transfer_closeout_ledger_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_transfer_closeout_ledger_product_log_evidence_ref_invalid");
    }
    const finalTransferCloseoutAcknowledgementRef = input.finalTransferCloseoutAcknowledgementRef.trim();
    if (!SAFE_FINAL_TRANSFER_CLOSEOUT_ACK_REF_PATTERN.test(finalTransferCloseoutAcknowledgementRef)) {
        blockingReasonCodes.push("final_transfer_closeout_ledger_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || operatorFinalHandoffReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_transfer_closeout_ledger_blocked",
            blockingReasonCodes,
        });
    }
    const ledgerStatus = "ready";
    return baseResult({
        status: "final_transfer_closeout_ledger_ready",
        reasonCode: "active_tab_info_final_transfer_closeout_ledger_ready",
        ledger: Object.freeze({
            finalTransferCloseoutLedgerId: buildFinalTransferCloseoutLedgerId({
                operatorFinalHandoffReceiptId,
                sanitizedFinalTransferCloseoutLedgerRef,
                productLogEvidenceRef,
                finalTransferCloseoutAcknowledgementRef,
                ledgerStatus,
            }),
            operatorFinalHandoffReceiptId,
            sanitizedFinalTransferCloseoutLedgerRef,
            productLogEvidenceRef,
            finalTransferCloseoutAcknowledgementRef,
            ledgerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-transfer-closeout-ledger.js.map