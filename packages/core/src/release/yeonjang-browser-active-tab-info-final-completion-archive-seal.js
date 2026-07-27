import { createHash } from "node:crypto";
const SAFE_FINAL_COMPLETION_ARCHIVE_SEAL_REF_PATTERN = /^final-completion-archive-seal:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_FINAL_COMPLETION_ARCHIVE_ACK_REF_PATTERN = /^final-completion-archive:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractOperatorCompletionArchiveAcknowledgementId(acknowledgement) {
    if (acknowledgement.status !== "operator_completion_archive_acknowledgement_ready" ||
        acknowledgement.acknowledgement === undefined) {
        return undefined;
    }
    return acknowledgement.acknowledgement.operatorCompletionArchiveAcknowledgementId;
}
function buildFinalCompletionArchiveSealId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.operatorCompletionArchiveAcknowledgementId,
        input.sanitizedFinalCompletionArchiveSealRef,
        input.productLogEvidenceRef,
        input.finalCompletionArchiveAcknowledgementRef,
        input.sealStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `final-completion-archive-seal:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-completion-archive-seal.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.seal === undefined ? {} : { seal: input.seal }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal(input) {
    const blockingReasonCodes = [];
    const operatorCompletionArchiveAcknowledgementId = extractOperatorCompletionArchiveAcknowledgementId(input.operatorCompletionArchiveAcknowledgement);
    if (operatorCompletionArchiveAcknowledgementId === undefined) {
        blockingReasonCodes.push("final_completion_archive_seal_acknowledgement_not_ready");
    }
    const sanitizedFinalCompletionArchiveSealRef = input.sanitizedFinalCompletionArchiveSealRef.trim();
    if (!SAFE_FINAL_COMPLETION_ARCHIVE_SEAL_REF_PATTERN.test(sanitizedFinalCompletionArchiveSealRef)) {
        blockingReasonCodes.push("final_completion_archive_seal_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("final_completion_archive_seal_product_log_evidence_ref_invalid");
    }
    const finalCompletionArchiveAcknowledgementRef = input.finalCompletionArchiveAcknowledgementRef.trim();
    if (!SAFE_FINAL_COMPLETION_ARCHIVE_ACK_REF_PATTERN.test(finalCompletionArchiveAcknowledgementRef)) {
        blockingReasonCodes.push("final_completion_archive_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || operatorCompletionArchiveAcknowledgementId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_final_completion_archive_seal_blocked",
            blockingReasonCodes,
        });
    }
    const sealStatus = "ready";
    return baseResult({
        status: "final_completion_archive_seal_ready",
        reasonCode: "active_tab_info_final_completion_archive_seal_ready",
        seal: Object.freeze({
            finalCompletionArchiveSealId: buildFinalCompletionArchiveSealId({
                operatorCompletionArchiveAcknowledgementId,
                sanitizedFinalCompletionArchiveSealRef,
                productLogEvidenceRef,
                finalCompletionArchiveAcknowledgementRef,
                sealStatus,
            }),
            operatorCompletionArchiveAcknowledgementId,
            sanitizedFinalCompletionArchiveSealRef,
            productLogEvidenceRef,
            finalCompletionArchiveAcknowledgementRef,
            sealStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-completion-archive-seal.js.map