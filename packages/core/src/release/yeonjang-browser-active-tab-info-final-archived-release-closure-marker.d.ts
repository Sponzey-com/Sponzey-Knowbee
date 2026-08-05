import type { YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt } from "./yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarkerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarkerBlockingReasonCode = "final_archived_release_closure_marker_receipt_not_ready" | "final_archived_release_closure_marker_ref_invalid" | "final_archived_release_closure_marker_product_log_evidence_ref_invalid" | "final_archive_retention_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarkerInput {
    operatorArchiveIndexRetentionReceipt: YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt;
    sanitizedArchivedReleaseClosureMarkerRef: string;
    productLogEvidenceRef: string;
    finalArchiveRetentionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archived-release-closure-marker.v1";
    method: "browser.active_tab_info";
    status: "final_archived_release_closure_marker_ready" | "blocked";
    reasonCode: "active_tab_info_final_archived_release_closure_marker_ready" | "active_tab_info_final_archived_release_closure_marker_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarkerBlockingReasonCode[];
    marker?: Readonly<{
        finalArchivedReleaseClosureMarkerId: string;
        operatorArchiveIndexRetentionReceiptId: string;
        sanitizedArchivedReleaseClosureMarkerRef: string;
        productLogEvidenceRef: string;
        finalArchiveRetentionAcknowledgementRef: string;
        markerStatus: YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarkerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker(input: YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarkerInput): YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-archived-release-closure-marker.d.ts.map