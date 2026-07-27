import { createHash } from "node:crypto";
const SAFE_EVIDENCE_INDEX_REF_PATTERN = /^archival-evidence-index:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_AUDIT_RETRIEVAL_ACK_REF_PATTERN = /^audit-retrieval:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalArchivalPointerId(pointer) {
    if (pointer.status !== "final_archival_pointer_ready" || pointer.pointer === undefined) {
        return undefined;
    }
    return pointer.pointer.finalArchivalPointerId;
}
function buildArchivalReleaseEvidenceIndexId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalArchivalPointerId,
        input.sanitizedEvidenceIndexRef,
        input.productLogEvidenceRef,
        input.auditRetrievalAcknowledgementRef,
        input.indexStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `archival-release-evidence-index:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-archival-release-evidence-index.v1",
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
export function buildYeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex(input) {
    const blockingReasonCodes = [];
    const finalArchivalPointerId = extractFinalArchivalPointerId(input.finalArchivalPointer);
    if (finalArchivalPointerId === undefined) {
        blockingReasonCodes.push("archival_release_evidence_index_pointer_not_ready");
    }
    const sanitizedEvidenceIndexRef = input.sanitizedEvidenceIndexRef.trim();
    if (!SAFE_EVIDENCE_INDEX_REF_PATTERN.test(sanitizedEvidenceIndexRef)) {
        blockingReasonCodes.push("archival_release_evidence_index_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("archival_release_evidence_index_product_log_evidence_ref_invalid");
    }
    const auditRetrievalAcknowledgementRef = input.auditRetrievalAcknowledgementRef.trim();
    if (!SAFE_AUDIT_RETRIEVAL_ACK_REF_PATTERN.test(auditRetrievalAcknowledgementRef)) {
        blockingReasonCodes.push("archival_release_evidence_index_audit_retrieval_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || finalArchivalPointerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_archival_release_evidence_index_blocked",
            blockingReasonCodes,
        });
    }
    const indexStatus = "ready";
    return baseResult({
        status: "archival_release_evidence_index_ready",
        reasonCode: "active_tab_info_archival_release_evidence_index_ready",
        index: Object.freeze({
            archivalReleaseEvidenceIndexId: buildArchivalReleaseEvidenceIndexId({
                finalArchivalPointerId,
                sanitizedEvidenceIndexRef,
                productLogEvidenceRef,
                auditRetrievalAcknowledgementRef,
                indexStatus,
            }),
            finalArchivalPointerId,
            sanitizedEvidenceIndexRef,
            productLogEvidenceRef,
            auditRetrievalAcknowledgementRef,
            indexStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-archival-release-evidence-index.js.map