import { createHash } from "node:crypto";
const SAFE_OPERATOR_NOTICE_REF_PATTERN = /^operator-completion-notice:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_USER_VISIBLE_RESPONSE_ACK_REF_PATTERN = /^user-visible-response:active-tab-info:ack:[a-z0-9._:-]+$/u;
function extractFinalAuditHandoffBundleId(bundle) {
    if (bundle.status !== "final_audit_handoff_bundle_ready" || bundle.bundle === undefined) {
        return undefined;
    }
    return bundle.bundle.finalAuditHandoffBundleId;
}
function buildOperatorCompletionNoticeId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.finalAuditHandoffBundleId,
        input.sanitizedOperatorNoticeRef,
        input.productLogEvidenceRef,
        input.userVisibleResponseAcknowledgementRef,
        input.noticeStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `operator-completion-notice:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-completion-notice.v1",
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
export function buildYeonjangBrowserActiveTabInfoOperatorCompletionNotice(input) {
    const blockingReasonCodes = [];
    const finalAuditHandoffBundleId = extractFinalAuditHandoffBundleId(input.finalAuditHandoffBundle);
    if (finalAuditHandoffBundleId === undefined) {
        blockingReasonCodes.push("operator_completion_notice_handoff_bundle_not_ready");
    }
    const sanitizedOperatorNoticeRef = input.sanitizedOperatorNoticeRef.trim();
    if (!SAFE_OPERATOR_NOTICE_REF_PATTERN.test(sanitizedOperatorNoticeRef)) {
        blockingReasonCodes.push("operator_completion_notice_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("operator_completion_notice_product_log_evidence_ref_invalid");
    }
    const userVisibleResponseAcknowledgementRef = input.userVisibleResponseAcknowledgementRef.trim();
    if (!SAFE_USER_VISIBLE_RESPONSE_ACK_REF_PATTERN.test(userVisibleResponseAcknowledgementRef)) {
        blockingReasonCodes.push("operator_completion_notice_user_visible_ack_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || finalAuditHandoffBundleId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_operator_completion_notice_blocked",
            blockingReasonCodes,
        });
    }
    const noticeStatus = "ready";
    return baseResult({
        status: "operator_completion_notice_ready",
        reasonCode: "active_tab_info_operator_completion_notice_ready",
        notice: Object.freeze({
            operatorCompletionNoticeId: buildOperatorCompletionNoticeId({
                finalAuditHandoffBundleId,
                sanitizedOperatorNoticeRef,
                productLogEvidenceRef,
                userVisibleResponseAcknowledgementRef,
                noticeStatus,
            }),
            finalAuditHandoffBundleId,
            sanitizedOperatorNoticeRef,
            productLogEvidenceRef,
            userVisibleResponseAcknowledgementRef,
            noticeStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-completion-notice.js.map