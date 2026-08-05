import type { YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary } from "./yeonjang-browser-active-tab-info-operator-readable-closeout-summary.js";
export type YeonjangBrowserActiveTabInfoFinalArchivalPointerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalArchivalPointerBlockingReasonCode = "final_archival_pointer_closeout_summary_not_ready" | "final_archival_pointer_archive_descriptor_ref_invalid" | "final_archival_pointer_product_log_evidence_ref_invalid" | "final_archival_pointer_retention_policy_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalArchivalPointerInput {
    operatorReadableCloseoutSummary: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary;
    sanitizedArchiveDescriptorRef: string;
    productLogEvidenceRef: string;
    retentionPolicyAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalArchivalPointer = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archival-pointer.v1";
    method: "browser.active_tab_info";
    status: "final_archival_pointer_ready" | "blocked";
    reasonCode: "active_tab_info_final_archival_pointer_ready" | "active_tab_info_final_archival_pointer_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalArchivalPointerBlockingReasonCode[];
    pointer?: Readonly<{
        finalArchivalPointerId: string;
        operatorReadableCloseoutSummaryId: string;
        sanitizedArchiveDescriptorRef: string;
        productLogEvidenceRef: string;
        retentionPolicyAcknowledgementRef: string;
        archivalPointerStatus: YeonjangBrowserActiveTabInfoFinalArchivalPointerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalArchivalPointer(input: YeonjangBrowserActiveTabInfoFinalArchivalPointerInput): YeonjangBrowserActiveTabInfoFinalArchivalPointer;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-archival-pointer.d.ts.map