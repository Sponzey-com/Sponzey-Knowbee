import { createHash } from "node:crypto";
const SAFE_ARCHIVE_COMPLETION_NOTICE_REF_PATTERN = /^archive-completion-notice:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_ARCHIVE_ACK_REF_PATTERN = /^operator-archive:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalAuditReleaseClosureLedgerId(ledger) {
    if (ledger.status !== "final_audit_release_closure_ledger_ready" || ledger.ledger === undefined) {
        return undefined;
    }
    return ledger.ledger.finalAuditReleaseClosureLedgerId;
}
function buildOperatorReleaseArchiveCompletionNoticeId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalAuditReleaseClosureLedgerId,
        input.sanitizedArchiveCompletionNoticeRef,
        input.productLogEvidenceRef,
        input.operatorArchiveAcknowledgementRef,
        input.noticeStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-release-archive-completion-notice:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-release-archive-completion-notice.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.notice === undefined ? {} : { notice: input.notice }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice(input) {
    const blockingReasonCodes = [];
    const finalAuditReleaseClosureLedgerId = extractFinalAuditReleaseClosureLedgerId(input.finalAuditReleaseClosureLedger);
    if (finalAuditReleaseClosureLedgerId === undefined) {
        blockingReasonCodes.push("operator_release_archive_completion_notice_closure_ledger_not_ready");
    }
    const sanitizedArchiveCompletionNoticeRef = input.sanitizedArchiveCompletionNoticeRef.trim();
    if (!SAFE_ARCHIVE_COMPLETION_NOTICE_REF_PATTERN.test(sanitizedArchiveCompletionNoticeRef)) {
        blockingReasonCodes.push("operator_release_archive_completion_notice_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_release_archive_completion_notice_product_log_evidence_ref_invalid");
    }
    const operatorArchiveAcknowledgementRef = input.operatorArchiveAcknowledgementRef.trim();
    if (!SAFE_OPERATOR_ARCHIVE_ACK_REF_PATTERN.test(operatorArchiveAcknowledgementRef)) {
        blockingReasonCodes.push("operator_release_archive_completion_notice_operator_archive_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || finalAuditReleaseClosureLedgerId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_release_archive_completion_notice_blocked",
            blockingReasonCodes,
        });
    }
    const noticeStatus = "ready";
    return baseResult({
        status: "operator_release_archive_completion_notice_ready",
        reasonCode: "active_tab_info_operator_release_archive_completion_notice_ready",
        notice: Object.freeze({
            operatorReleaseArchiveCompletionNoticeId: buildOperatorReleaseArchiveCompletionNoticeId({
                finalAuditReleaseClosureLedgerId,
                sanitizedArchiveCompletionNoticeRef,
                productLogEvidenceRef,
                operatorArchiveAcknowledgementRef,
                noticeStatus,
            }),
            finalAuditReleaseClosureLedgerId,
            sanitizedArchiveCompletionNoticeRef,
            productLogEvidenceRef,
            operatorArchiveAcknowledgementRef,
            noticeStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-release-archive-completion-notice.js.map