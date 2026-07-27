import { createHash } from "node:crypto";
const SAFE_AUDIT_ARTIFACT_DESCRIPTOR_REF_PATTERN = /^audit-artifact-descriptor:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_RELEASE_SURFACE_MATRIX_ACK_REF_PATTERN = /^release-surface-matrix:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalCloseoutLedgerId(ledger) {
    if (ledger.status !== "final_closeout_ledger_ready" || ledger.ledger === undefined) {
        return undefined;
    }
    return ledger.ledger.finalCloseoutLedgerId;
}
function buildFinalAuditHandoffBundleId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalCloseoutLedgerId,
        input.sanitizedAuditArtifactDescriptorRef,
        input.productLogEvidenceRef,
        input.releaseSurfaceMatrixAcknowledgementRef,
        input.handoffStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-audit-handoff-bundle:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-handoff-bundle.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.bundle === undefined ? {} : { bundle: input.bundle }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoFinalAuditHandoffBundle(input) {
    const blockingReasonCodes = [];
    const finalCloseoutLedgerId = extractFinalCloseoutLedgerId(input.finalCloseoutLedger);
    if (finalCloseoutLedgerId === undefined) {
        blockingReasonCodes.push("final_audit_handoff_ledger_not_ready");
    }
    const sanitizedAuditArtifactDescriptorRef = input.sanitizedAuditArtifactDescriptorRef.trim();
    if (!SAFE_AUDIT_ARTIFACT_DESCRIPTOR_REF_PATTERN.test(sanitizedAuditArtifactDescriptorRef)) {
        blockingReasonCodes.push("final_audit_handoff_descriptor_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_audit_handoff_product_log_evidence_ref_invalid");
    }
    const releaseSurfaceMatrixAcknowledgementRef = input.releaseSurfaceMatrixAcknowledgementRef.trim();
    if (!SAFE_RELEASE_SURFACE_MATRIX_ACK_REF_PATTERN.test(releaseSurfaceMatrixAcknowledgementRef)) {
        blockingReasonCodes.push("final_audit_handoff_surface_matrix_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || finalCloseoutLedgerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_audit_handoff_bundle_blocked",
            blockingReasonCodes,
        });
    }
    const handoffStatus = "handoff_ready";
    return baseResult({
        status: "final_audit_handoff_bundle_ready",
        reasonCode: "active_tab_info_final_audit_handoff_bundle_ready",
        bundle: Object.freeze({
            finalAuditHandoffBundleId: buildFinalAuditHandoffBundleId({
                finalCloseoutLedgerId,
                sanitizedAuditArtifactDescriptorRef,
                productLogEvidenceRef,
                releaseSurfaceMatrixAcknowledgementRef,
                handoffStatus,
            }),
            finalCloseoutLedgerId,
            sanitizedAuditArtifactDescriptorRef,
            productLogEvidenceRef,
            releaseSurfaceMatrixAcknowledgementRef,
            handoffStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-audit-handoff-bundle.js.map