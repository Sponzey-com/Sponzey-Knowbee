import { createHash } from "node:crypto";
const SAFE_USER_ACK_REF_PATTERN = /^user-ack:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_CLOSEOUT_NOTE_REF_PATTERN = /^operator-closeout-note:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
function extractTerminalDeliveryReceiptId(receipt) {
    if (receipt.status !== "terminal_delivery_receipt_ready" || receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.terminalDeliveryReceiptId;
}
function buildOperatorCloseoutNoteId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.terminalDeliveryReceiptId,
        input.sanitizedUserAcknowledgementRef,
        input.productLogEvidenceRef,
        input.sanitizedOperatorCloseoutNoteRef,
        input.closeoutStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-closeout-note:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-closeout-note.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.note === undefined ? {} : { note: input.note }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoOperatorCloseoutNote(input) {
    const blockingReasonCodes = [];
    const terminalDeliveryReceiptId = extractTerminalDeliveryReceiptId(input.terminalDeliveryReceipt);
    if (terminalDeliveryReceiptId === undefined) {
        blockingReasonCodes.push("operator_closeout_terminal_delivery_receipt_not_ready");
    }
    const sanitizedUserAcknowledgementRef = input.sanitizedUserAcknowledgementRef.trim();
    if (!SAFE_USER_ACK_REF_PATTERN.test(sanitizedUserAcknowledgementRef)) {
        blockingReasonCodes.push("operator_closeout_user_ack_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_closeout_product_log_evidence_ref_invalid");
    }
    const sanitizedOperatorCloseoutNoteRef = input.sanitizedOperatorCloseoutNoteRef.trim();
    if (!SAFE_OPERATOR_CLOSEOUT_NOTE_REF_PATTERN.test(sanitizedOperatorCloseoutNoteRef)) {
        blockingReasonCodes.push("operator_closeout_note_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || terminalDeliveryReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_closeout_note_blocked",
            blockingReasonCodes,
        });
    }
    const closeoutStatus = "closed";
    return baseResult({
        status: "operator_closeout_note_ready",
        reasonCode: "active_tab_info_operator_closeout_note_ready",
        note: Object.freeze({
            operatorCloseoutNoteId: buildOperatorCloseoutNoteId({
                terminalDeliveryReceiptId,
                sanitizedUserAcknowledgementRef,
                productLogEvidenceRef,
                sanitizedOperatorCloseoutNoteRef,
                closeoutStatus,
            }),
            terminalDeliveryReceiptId,
            sanitizedUserAcknowledgementRef,
            productLogEvidenceRef,
            sanitizedOperatorCloseoutNoteRef,
            closeoutStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-closeout-note.js.map