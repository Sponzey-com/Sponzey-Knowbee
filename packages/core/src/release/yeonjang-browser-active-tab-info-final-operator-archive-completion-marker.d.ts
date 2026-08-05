import type { YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-archival-completion-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarkerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarkerBlockingReasonCode = "final_operator_archive_completion_marker_receipt_not_ready" | "final_operator_archive_completion_marker_ref_invalid" | "final_operator_archive_completion_marker_product_log_evidence_ref_invalid" | "final_operator_archive_completion_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarkerInput {
    operatorArchivalCompletionAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt;
    sanitizedFinalOperatorArchiveCompletionMarkerRef: string;
    productLogEvidenceRef: string;
    finalOperatorArchiveCompletionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-operator-archive-completion-marker.v1";
    method: "browser.active_tab_info";
    status: "final_operator_archive_completion_marker_ready" | "blocked";
    reasonCode: "active_tab_info_final_operator_archive_completion_marker_ready" | "active_tab_info_final_operator_archive_completion_marker_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarkerBlockingReasonCode[];
    marker?: Readonly<{
        finalOperatorArchiveCompletionMarkerId: string;
        operatorArchivalCompletionAcknowledgementReceiptId: string;
        sanitizedFinalOperatorArchiveCompletionMarkerRef: string;
        productLogEvidenceRef: string;
        finalOperatorArchiveCompletionAcknowledgementRef: string;
        markerStatus: YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarkerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker(input: YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarkerInput): YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-operator-archive-completion-marker.d.ts.map