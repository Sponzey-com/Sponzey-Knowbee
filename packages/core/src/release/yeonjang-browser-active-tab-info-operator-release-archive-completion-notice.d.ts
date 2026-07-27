import type { YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger } from "./yeonjang-browser-active-tab-info-final-audit-release-closure-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNoticeStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNoticeBlockingReasonCode = "operator_release_archive_completion_notice_closure_ledger_not_ready" | "operator_release_archive_completion_notice_ref_invalid" | "operator_release_archive_completion_notice_product_log_evidence_ref_invalid" | "operator_release_archive_completion_notice_operator_archive_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNoticeInput {
    finalAuditReleaseClosureLedger: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger;
    sanitizedArchiveCompletionNoticeRef: string;
    productLogEvidenceRef: string;
    operatorArchiveAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-release-archive-completion-notice.v1";
    method: "browser.active_tab_info";
    status: "operator_release_archive_completion_notice_ready" | "blocked";
    reasonCode: "active_tab_info_operator_release_archive_completion_notice_ready" | "active_tab_info_operator_release_archive_completion_notice_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNoticeBlockingReasonCode[];
    notice?: Readonly<{
        operatorReleaseArchiveCompletionNoticeId: string;
        finalAuditReleaseClosureLedgerId: string;
        sanitizedArchiveCompletionNoticeRef: string;
        productLogEvidenceRef: string;
        operatorArchiveAcknowledgementRef: string;
        noticeStatus: YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNoticeStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice(input: YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNoticeInput): YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-release-archive-completion-notice.d.ts.map