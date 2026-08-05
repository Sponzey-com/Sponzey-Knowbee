import { createHash } from "node:crypto";
const SAFE_RELEASE_HANDOFF_RECEIPT_REF_PATTERN = /^release-handoff:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_MANUAL_AUDIT_QUEUE_ACK_REF_PATTERN = /^manual-audit-queue:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractArchivalReleaseEvidenceIndexId(index) {
    if (index.status !== "archival_release_evidence_index_ready" || index.index === undefined) {
        return undefined;
    }
    return index.index.archivalReleaseEvidenceIndexId;
}
function buildFinalAuditReleaseHandoffReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.archivalReleaseEvidenceIndexId,
        input.sanitizedReleaseHandoffReceiptRef,
        input.productLogEvidenceRef,
        input.manualAuditQueueAcknowledgementRef,
        input.receiptStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-audit-release-handoff-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.v1",
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
export function buildYeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt(input) {
    const blockingReasonCodes = [];
    const archivalReleaseEvidenceIndexId = extractArchivalReleaseEvidenceIndexId(input.archivalReleaseEvidenceIndex);
    if (archivalReleaseEvidenceIndexId === undefined) {
        blockingReasonCodes.push("final_audit_release_handoff_receipt_index_not_ready");
    }
    const sanitizedReleaseHandoffReceiptRef = input.sanitizedReleaseHandoffReceiptRef.trim();
    if (!SAFE_RELEASE_HANDOFF_RECEIPT_REF_PATTERN.test(sanitizedReleaseHandoffReceiptRef)) {
        blockingReasonCodes.push("final_audit_release_handoff_receipt_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_audit_release_handoff_receipt_product_log_evidence_ref_invalid");
    }
    const manualAuditQueueAcknowledgementRef = input.manualAuditQueueAcknowledgementRef.trim();
    if (!SAFE_MANUAL_AUDIT_QUEUE_ACK_REF_PATTERN.test(manualAuditQueueAcknowledgementRef)) {
        blockingReasonCodes.push("final_audit_release_handoff_receipt_manual_audit_queue_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || archivalReleaseEvidenceIndexId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_audit_release_handoff_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const receiptStatus = "ready";
    return baseResult({
        status: "final_audit_release_handoff_receipt_ready",
        reasonCode: "active_tab_info_final_audit_release_handoff_receipt_ready",
        receipt: Object.freeze({
            finalAuditReleaseHandoffReceiptId: buildFinalAuditReleaseHandoffReceiptId({
                archivalReleaseEvidenceIndexId,
                sanitizedReleaseHandoffReceiptRef,
                productLogEvidenceRef,
                manualAuditQueueAcknowledgementRef,
                receiptStatus,
            }),
            archivalReleaseEvidenceIndexId,
            sanitizedReleaseHandoffReceiptRef,
            productLogEvidenceRef,
            manualAuditQueueAcknowledgementRef,
            receiptStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.js.map