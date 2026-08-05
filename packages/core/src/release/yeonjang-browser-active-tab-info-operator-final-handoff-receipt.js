import { createHash } from "node:crypto";
const SAFE_OPERATOR_FINAL_HANDOFF_RECEIPT_REF_PATTERN = /^operator-final-handoff-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_FINAL_HANDOFF_ACK_REF_PATTERN = /^operator-final-handoff:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalHandoffClosureMarkerId(marker) {
    if (marker.status !== "final_handoff_closure_marker_ready" ||
        marker.marker === undefined) {
        return undefined;
    }
    return marker.marker.finalHandoffClosureMarkerId;
}
function buildOperatorFinalHandoffReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalHandoffClosureMarkerId,
        input.sanitizedOperatorFinalHandoffReceiptRef,
        input.productLogEvidenceRef,
        input.operatorFinalHandoffAcknowledgementRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-final-handoff-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-handoff-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt(input) {
    const blockingReasonCodes = [];
    const finalHandoffClosureMarkerId = extractFinalHandoffClosureMarkerId(input.finalHandoffClosureMarker);
    if (finalHandoffClosureMarkerId === undefined) {
        blockingReasonCodes.push("operator_final_handoff_receipt_marker_not_ready");
    }
    const sanitizedOperatorFinalHandoffReceiptRef = input.sanitizedOperatorFinalHandoffReceiptRef.trim();
    if (!SAFE_OPERATOR_FINAL_HANDOFF_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalHandoffReceiptRef)) {
        blockingReasonCodes.push("operator_final_handoff_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_final_handoff_receipt_product_log_evidence_ref_invalid");
    }
    const operatorFinalHandoffAcknowledgementRef = input.operatorFinalHandoffAcknowledgementRef.trim();
    if (!SAFE_OPERATOR_FINAL_HANDOFF_ACK_REF_PATTERN.test(operatorFinalHandoffAcknowledgementRef)) {
        blockingReasonCodes.push("operator_final_handoff_receipt_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || finalHandoffClosureMarkerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_final_handoff_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "operator_final_handoff_receipt_ready",
        reasonCode: "active_tab_info_operator_final_handoff_receipt_ready",
        receipt: Object.freeze({
            operatorFinalHandoffReceiptId: buildOperatorFinalHandoffReceiptId({
                finalHandoffClosureMarkerId,
                sanitizedOperatorFinalHandoffReceiptRef,
                productLogEvidenceRef,
                operatorFinalHandoffAcknowledgementRef,
                receiptStatus,
            }),
            finalHandoffClosureMarkerId,
            sanitizedOperatorFinalHandoffReceiptRef,
            productLogEvidenceRef,
            operatorFinalHandoffAcknowledgementRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-handoff-receipt.js.map