import { createHash } from "node:crypto";
const SAFE_ARCHIVAL_COMPLETION_INDEX_REF_PATTERN = /^archival-completion-index:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_ARCHIVAL_COMPLETION_RETENTION_ACK_REF_PATTERN = /^archival-completion-retention:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorArchivedReleaseAcknowledgementId(acknowledgement) {
    if (acknowledgement.status !== "operator_archived_release_acknowledgement_ready" ||
        acknowledgement.acknowledgement === undefined) {
        return undefined;
    }
    return acknowledgement.acknowledgement.operatorArchivedReleaseAcknowledgementId;
}
function buildFinalArchivalCompletionIndexId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorArchivedReleaseAcknowledgementId,
        input.sanitizedArchivalCompletionIndexRef,
        input.productLogEvidenceRef,
        input.archivalCompletionRetentionAcknowledgementRef,
        input.indexStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-archival-completion-index:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archival-completion-index.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.index === undefined ? {} : { index: input.index }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex(input) {
    const blockingReasonCodes = [];
    const operatorArchivedReleaseAcknowledgementId = extractOperatorArchivedReleaseAcknowledgementId(input.operatorArchivedReleaseAcknowledgement);
    if (operatorArchivedReleaseAcknowledgementId === undefined) {
        blockingReasonCodes.push("final_archival_completion_index_acknowledgement_not_ready");
    }
    const sanitizedArchivalCompletionIndexRef = input.sanitizedArchivalCompletionIndexRef.trim();
    if (!SAFE_ARCHIVAL_COMPLETION_INDEX_REF_PATTERN.test(sanitizedArchivalCompletionIndexRef)) {
        blockingReasonCodes.push("final_archival_completion_index_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_archival_completion_index_product_log_evidence_ref_invalid");
    }
    const archivalCompletionRetentionAcknowledgementRef = input.archivalCompletionRetentionAcknowledgementRef.trim();
    if (!SAFE_ARCHIVAL_COMPLETION_RETENTION_ACK_REF_PATTERN.test(archivalCompletionRetentionAcknowledgementRef)) {
        blockingReasonCodes.push("archival_completion_retention_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || operatorArchivedReleaseAcknowledgementId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_archival_completion_index_blocked",
            blockingReasonCodes,
        });
    }
    const indexStatus = "ready";
    return baseResult({
        status: "final_archival_completion_index_ready",
        reasonCode: "active_tab_info_final_archival_completion_index_ready",
        index: Object.freeze({
            finalArchivalCompletionIndexId: buildFinalArchivalCompletionIndexId({
                operatorArchivedReleaseAcknowledgementId,
                sanitizedArchivalCompletionIndexRef,
                productLogEvidenceRef,
                archivalCompletionRetentionAcknowledgementRef,
                indexStatus,
            }),
            operatorArchivedReleaseAcknowledgementId,
            sanitizedArchivalCompletionIndexRef,
            productLogEvidenceRef,
            archivalCompletionRetentionAcknowledgementRef,
            indexStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-archival-completion-index.js.map