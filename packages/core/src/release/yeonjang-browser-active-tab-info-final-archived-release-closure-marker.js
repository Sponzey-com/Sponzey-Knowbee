import { createHash } from "node:crypto";
const SAFE_ARCHIVED_RELEASE_CLOSURE_MARKER_REF_PATTERN = /^archived-release-closure-marker:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_ARCHIVE_RETENTION_ACK_REF_PATTERN = /^final-archive-retention:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorArchiveIndexRetentionReceiptId(receipt) {
    if (receipt.status !== "operator_archive_index_retention_receipt_ready" || receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.operatorArchiveIndexRetentionReceiptId;
}
function buildFinalArchivedReleaseClosureMarkerId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorArchiveIndexRetentionReceiptId,
        input.sanitizedArchivedReleaseClosureMarkerRef,
        input.productLogEvidenceRef,
        input.finalArchiveRetentionAcknowledgementRef,
        input.markerStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-archived-release-closure-marker:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archived-release-closure-marker.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker(input) {
    const blockingReasonCodes = [];
    const operatorArchiveIndexRetentionReceiptId = extractOperatorArchiveIndexRetentionReceiptId(input.operatorArchiveIndexRetentionReceipt);
    if (operatorArchiveIndexRetentionReceiptId === undefined) {
        blockingReasonCodes.push("final_archived_release_closure_marker_receipt_not_ready");
    }
    const sanitizedArchivedReleaseClosureMarkerRef = input.sanitizedArchivedReleaseClosureMarkerRef.trim();
    if (!SAFE_ARCHIVED_RELEASE_CLOSURE_MARKER_REF_PATTERN.test(sanitizedArchivedReleaseClosureMarkerRef)) {
        blockingReasonCodes.push("final_archived_release_closure_marker_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_archived_release_closure_marker_product_log_evidence_ref_invalid");
    }
    const finalArchiveRetentionAcknowledgementRef = input.finalArchiveRetentionAcknowledgementRef.trim();
    if (!SAFE_FINAL_ARCHIVE_RETENTION_ACK_REF_PATTERN.test(finalArchiveRetentionAcknowledgementRef)) {
        blockingReasonCodes.push("final_archive_retention_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || operatorArchiveIndexRetentionReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_archived_release_closure_marker_blocked",
            blockingReasonCodes,
        });
    }
    const markerStatus = "ready";
    return baseResult({
        status: "final_archived_release_closure_marker_ready",
        reasonCode: "active_tab_info_final_archived_release_closure_marker_ready",
        marker: Object.freeze({
            finalArchivedReleaseClosureMarkerId: buildFinalArchivedReleaseClosureMarkerId({
                operatorArchiveIndexRetentionReceiptId,
                sanitizedArchivedReleaseClosureMarkerRef,
                productLogEvidenceRef,
                finalArchiveRetentionAcknowledgementRef,
                markerStatus,
            }),
            operatorArchiveIndexRetentionReceiptId,
            sanitizedArchivedReleaseClosureMarkerRef,
            productLogEvidenceRef,
            finalArchiveRetentionAcknowledgementRef,
            markerStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-archived-release-closure-marker.js.map