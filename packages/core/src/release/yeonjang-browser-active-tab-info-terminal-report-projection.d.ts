import type { YeonjangBrowserActiveTabInfoCompletionAuditSummary } from "./yeonjang-browser-active-tab-info-completion-audit-summary.js";
export type YeonjangBrowserActiveTabInfoTerminalReportStatus = "ready";
export type YeonjangBrowserActiveTabInfoTerminalReportProjectionBlockingReasonCode = "terminal_report_completion_audit_summary_not_ready" | "terminal_report_user_facing_ack_ref_invalid" | "terminal_report_product_log_evidence_ref_invalid" | "terminal_report_sanitized_report_ref_invalid";
export interface YeonjangBrowserActiveTabInfoTerminalReportProjectionInput {
    completionAuditSummary: YeonjangBrowserActiveTabInfoCompletionAuditSummary;
    userFacingResponseAcknowledgementRef: string;
    productLogEvidenceRef: string;
    sanitizedTerminalReportRef: string;
}
export type YeonjangBrowserActiveTabInfoTerminalReportProjection = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-terminal-report-projection.v1";
    method: "browser.active_tab_info";
    status: "terminal_report_projection_ready" | "blocked";
    reasonCode: "active_tab_info_terminal_report_projection_ready" | "active_tab_info_terminal_report_projection_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoTerminalReportProjectionBlockingReasonCode[];
    projection?: Readonly<{
        terminalReportProjectionId: string;
        completionAuditSummaryId: string;
        userFacingResponseAcknowledgementRef: string;
        productLogEvidenceRef: string;
        sanitizedTerminalReportRef: string;
        terminalReportStatus: YeonjangBrowserActiveTabInfoTerminalReportStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoTerminalReportProjection(input: YeonjangBrowserActiveTabInfoTerminalReportProjectionInput): YeonjangBrowserActiveTabInfoTerminalReportProjection;
//# sourceMappingURL=yeonjang-browser-active-tab-info-terminal-report-projection.d.ts.map