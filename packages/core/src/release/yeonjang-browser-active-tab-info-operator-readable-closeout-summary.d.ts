import type { YeonjangBrowserActiveTabInfoOperatorCompletionNotice } from "./yeonjang-browser-active-tab-info-operator-completion-notice.js";
export type YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryBlockingReasonCode = "operator_readable_closeout_summary_notice_not_ready" | "operator_readable_closeout_summary_ref_invalid" | "operator_readable_closeout_summary_product_log_evidence_ref_invalid" | "operator_readable_closeout_summary_audit_handoff_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryInput {
    operatorCompletionNotice: YeonjangBrowserActiveTabInfoOperatorCompletionNotice;
    sanitizedCloseoutSummaryRef: string;
    productLogEvidenceRef: string;
    auditHandoffAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-readable-closeout-summary.v1";
    method: "browser.active_tab_info";
    status: "operator_readable_closeout_summary_ready" | "blocked";
    reasonCode: "active_tab_info_operator_readable_closeout_summary_ready" | "active_tab_info_operator_readable_closeout_summary_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryBlockingReasonCode[];
    summary?: Readonly<{
        operatorReadableCloseoutSummaryId: string;
        operatorCompletionNoticeId: string;
        sanitizedCloseoutSummaryRef: string;
        productLogEvidenceRef: string;
        auditHandoffAcknowledgementRef: string;
        summaryStatus: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary(input: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryInput): YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-readable-closeout-summary.d.ts.map