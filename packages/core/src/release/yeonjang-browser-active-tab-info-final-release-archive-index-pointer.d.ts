import type { YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice } from "./yeonjang-browser-active-tab-info-operator-release-archive-completion-notice.js";
export type YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerBlockingReasonCode = "final_release_archive_index_pointer_notice_not_ready" | "final_release_archive_index_pointer_ref_invalid" | "final_release_archive_index_pointer_product_log_evidence_ref_invalid" | "final_release_archive_index_pointer_retention_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerInput {
    operatorReleaseArchiveCompletionNotice: YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice;
    sanitizedReleaseArchiveIndexPointerRef: string;
    productLogEvidenceRef: string;
    archiveIndexRetentionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-release-archive-index-pointer.v1";
    method: "browser.active_tab_info";
    status: "final_release_archive_index_pointer_ready" | "blocked";
    reasonCode: "active_tab_info_final_release_archive_index_pointer_ready" | "active_tab_info_final_release_archive_index_pointer_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerBlockingReasonCode[];
    pointer?: Readonly<{
        finalReleaseArchiveIndexPointerId: string;
        operatorReleaseArchiveCompletionNoticeId: string;
        sanitizedReleaseArchiveIndexPointerRef: string;
        productLogEvidenceRef: string;
        archiveIndexRetentionAcknowledgementRef: string;
        pointerStatus: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer(input: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerInput): YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-release-archive-index-pointer.d.ts.map