import { createHash } from "node:crypto";
const SAFE_FINAL_OPERATOR_ARCHIVE_COMPLETION_MARKER_REF_PATTERN = /^final-operator-archive-completion-marker:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_OPERATOR_ARCHIVE_COMPLETION_ACK_REF_PATTERN = /^final-operator-archive-completion:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorArchivalCompletionAcknowledgementReceiptId(receipt) {
    if (receipt.status !== "operator_archival_completion_acknowledgement_receipt_ready" ||
        receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorArchivalCompletionAcknowledgementReceiptId;
}
function buildFinalOperatorArchiveCompletionMarkerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorArchivalCompletionAcknowledgementReceiptId,
        input.sanitizedFinalOperatorArchiveCompletionMarkerRef,
        input.productLogEvidenceRef,
        input.finalOperatorArchiveCompletionAcknowledgementRef,
        input.markerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-operator-archive-completion-marker:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-operator-archive-completion-marker.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.marker === undefined ? {} : { marker: input.marker }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker(input) {
    const blockingReasonCodes = [];
    const operatorArchivalCompletionAcknowledgementReceiptId = extractOperatorArchivalCompletionAcknowledgementReceiptId(input.operatorArchivalCompletionAcknowledgementReceipt);
    if (operatorArchivalCompletionAcknowledgementReceiptId === undefined) {
        blockingReasonCodes.push("final_operator_archive_completion_marker_receipt_not_ready");
    }
    const sanitizedFinalOperatorArchiveCompletionMarkerRef = input.sanitizedFinalOperatorArchiveCompletionMarkerRef.trim();
    if (!SAFE_FINAL_OPERATOR_ARCHIVE_COMPLETION_MARKER_REF_PATTERN.test(sanitizedFinalOperatorArchiveCompletionMarkerRef)) {
        blockingReasonCodes.push("final_operator_archive_completion_marker_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_operator_archive_completion_marker_product_log_evidence_ref_invalid");
    }
    const finalOperatorArchiveCompletionAcknowledgementRef = input.finalOperatorArchiveCompletionAcknowledgementRef.trim();
    if (!SAFE_FINAL_OPERATOR_ARCHIVE_COMPLETION_ACK_REF_PATTERN.test(finalOperatorArchiveCompletionAcknowledgementRef)) {
        blockingReasonCodes.push("final_operator_archive_completion_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || operatorArchivalCompletionAcknowledgementReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_operator_archive_completion_marker_blocked",
            blockingReasonCodes,
        });
    }
    const markerStatus = "ready";
    return baseResult({
        status: "final_operator_archive_completion_marker_ready",
        reasonCode: "active_tab_info_final_operator_archive_completion_marker_ready",
        marker: Object.freeze({
            finalOperatorArchiveCompletionMarkerId: buildFinalOperatorArchiveCompletionMarkerId({
                operatorArchivalCompletionAcknowledgementReceiptId,
                sanitizedFinalOperatorArchiveCompletionMarkerRef,
                productLogEvidenceRef,
                finalOperatorArchiveCompletionAcknowledgementRef,
                markerStatus,
            }),
            operatorArchivalCompletionAcknowledgementReceiptId,
            sanitizedFinalOperatorArchiveCompletionMarkerRef,
            productLogEvidenceRef,
            finalOperatorArchiveCompletionAcknowledgementRef,
            markerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-operator-archive-completion-marker.js.map