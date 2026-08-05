import { createHash } from "node:crypto";
const SAFE_USER_FACING_RESPONSE_ACK_REF_PATTERN = /^user-facing-response:active-tab-info:ack:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_TERMINAL_REPORT_REF_PATTERN = /^terminal-report:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
function extractCompletionAuditSummaryId(summary) {
    if (summary.status !== "completion_audit_summary_ready" || summary.summary === undefined) {
        return undefined;
    }
    return summary.summary.completionAuditSummaryId;
}
function buildTerminalReportProjectionId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.completionAuditSummaryId,
        input.userFacingResponseAcknowledgementRef,
        input.productLogEvidenceRef,
        input.sanitizedTerminalReportRef,
        input.terminalReportStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `terminal-report-projection:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-terminal-report-projection.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.projection === undefined ? {} : { projection: input.projection }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoTerminalReportProjection(input) {
    const blockingReasonCodes = [];
    const completionAuditSummaryId = extractCompletionAuditSummaryId(input.completionAuditSummary);
    if (completionAuditSummaryId === undefined) {
        blockingReasonCodes.push("terminal_report_completion_audit_summary_not_ready");
    }
    const userFacingResponseAcknowledgementRef = input.userFacingResponseAcknowledgementRef.trim();
    if (!SAFE_USER_FACING_RESPONSE_ACK_REF_PATTERN.test(userFacingResponseAcknowledgementRef)) {
        blockingReasonCodes.push("terminal_report_user_facing_ack_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("terminal_report_product_log_evidence_ref_invalid");
    }
    const sanitizedTerminalReportRef = input.sanitizedTerminalReportRef.trim();
    if (!SAFE_TERMINAL_REPORT_REF_PATTERN.test(sanitizedTerminalReportRef)) {
        blockingReasonCodes.push("terminal_report_sanitized_report_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || completionAuditSummaryId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_terminal_report_projection_blocked",
            blockingReasonCodes,
        });
    }
    const terminalReportStatus = "ready";
    return baseResult({
        status: "terminal_report_projection_ready",
        reasonCode: "active_tab_info_terminal_report_projection_ready",
        projection: Object.freeze({
            terminalReportProjectionId: buildTerminalReportProjectionId({
                completionAuditSummaryId,
                userFacingResponseAcknowledgementRef,
                productLogEvidenceRef,
                sanitizedTerminalReportRef,
                terminalReportStatus,
            }),
            completionAuditSummaryId,
            userFacingResponseAcknowledgementRef,
            productLogEvidenceRef,
            sanitizedTerminalReportRef,
            terminalReportStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-terminal-report-projection.js.map