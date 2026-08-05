import type { YeonjangBrowserActiveTabInfoFinalAuditHandoffBundle } from "./yeonjang-browser-active-tab-info-final-audit-handoff-bundle.js";
export type YeonjangBrowserActiveTabInfoOperatorCompletionNoticeStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorCompletionNoticeBlockingReasonCode = "operator_completion_notice_handoff_bundle_not_ready" | "operator_completion_notice_ref_invalid" | "operator_completion_notice_product_log_evidence_ref_invalid" | "operator_completion_notice_user_visible_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorCompletionNoticeInput {
    finalAuditHandoffBundle: YeonjangBrowserActiveTabInfoFinalAuditHandoffBundle;
    sanitizedOperatorNoticeRef: string;
    productLogEvidenceRef: string;
    userVisibleResponseAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorCompletionNotice = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-completion-notice.v1";
    method: "browser.active_tab_info";
    status: "operator_completion_notice_ready" | "blocked";
    reasonCode: "active_tab_info_operator_completion_notice_ready" | "active_tab_info_operator_completion_notice_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorCompletionNoticeBlockingReasonCode[];
    notice?: Readonly<{
        operatorCompletionNoticeId: string;
        finalAuditHandoffBundleId: string;
        sanitizedOperatorNoticeRef: string;
        productLogEvidenceRef: string;
        userVisibleResponseAcknowledgementRef: string;
        noticeStatus: YeonjangBrowserActiveTabInfoOperatorCompletionNoticeStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorCompletionNotice(input: YeonjangBrowserActiveTabInfoOperatorCompletionNoticeInput): YeonjangBrowserActiveTabInfoOperatorCompletionNotice;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-completion-notice.d.ts.map