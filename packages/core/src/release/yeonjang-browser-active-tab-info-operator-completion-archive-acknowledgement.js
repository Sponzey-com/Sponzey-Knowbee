import { createHash } from "node:crypto";
const SAFE_OPERATOR_COMPLETION_ARCHIVE_ACKNOWLEDGEMENT_REF_PATTERN = /^operator-completion-archive-acknowledgement:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_COMPLETION_ARCHIVE_ACK_REF_PATTERN = /^operator-completion-archive:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalOperatorArchiveCompletionMarkerId(marker) {
    if (marker.status !== "final_operator_archive_completion_marker_ready" || marker.marker === undefined) {
        return undefined;
    }
    return marker.marker.finalOperatorArchiveCompletionMarkerId;
}
function buildOperatorCompletionArchiveAcknowledgementId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalOperatorArchiveCompletionMarkerId,
        input.sanitizedOperatorCompletionArchiveAcknowledgementRef,
        input.productLogEvidenceRef,
        input.operatorCompletionArchiveAcknowledgementRef,
        input.acknowledgementStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-completion-archive-acknowledgement:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-completion-archive-acknowledgement.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.acknowledgement === undefined ? {} : { acknowledgement: input.acknowledgement }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement(input) {
    const blockingReasonCodes = [];
    const finalOperatorArchiveCompletionMarkerId = extractFinalOperatorArchiveCompletionMarkerId(input.finalOperatorArchiveCompletionMarker);
    if (finalOperatorArchiveCompletionMarkerId === undefined) {
        blockingReasonCodes.push("operator_completion_archive_acknowledgement_marker_not_ready");
    }
    const sanitizedOperatorCompletionArchiveAcknowledgementRef = input.sanitizedOperatorCompletionArchiveAcknowledgementRef.trim();
    if (!SAFE_OPERATOR_COMPLETION_ARCHIVE_ACKNOWLEDGEMENT_REF_PATTERN.test(sanitizedOperatorCompletionArchiveAcknowledgementRef)) {
        blockingReasonCodes.push("operator_completion_archive_acknowledgement_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_completion_archive_acknowledgement_product_log_evidence_ref_invalid");
    }
    const operatorCompletionArchiveAcknowledgementRef = input.operatorCompletionArchiveAcknowledgementRef.trim();
    if (!SAFE_OPERATOR_COMPLETION_ARCHIVE_ACK_REF_PATTERN.test(operatorCompletionArchiveAcknowledgementRef)) {
        blockingReasonCodes.push("operator_completion_archive_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || finalOperatorArchiveCompletionMarkerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_completion_archive_acknowledgement_blocked",
            blockingReasonCodes,
        });
    }
    const acknowledgementStatus = "ready";
    return baseResult({
        status: "operator_completion_archive_acknowledgement_ready",
        reasonCode: "active_tab_info_operator_completion_archive_acknowledgement_ready",
        acknowledgement: Object.freeze({
            operatorCompletionArchiveAcknowledgementId: buildOperatorCompletionArchiveAcknowledgementId({
                finalOperatorArchiveCompletionMarkerId,
                sanitizedOperatorCompletionArchiveAcknowledgementRef,
                productLogEvidenceRef,
                operatorCompletionArchiveAcknowledgementRef,
                acknowledgementStatus,
            }),
            finalOperatorArchiveCompletionMarkerId,
            sanitizedOperatorCompletionArchiveAcknowledgementRef,
            productLogEvidenceRef,
            operatorCompletionArchiveAcknowledgementRef,
            acknowledgementStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-completion-archive-acknowledgement.js.map