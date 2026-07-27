import type { YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt } from "./yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerBlockingReasonCode = "final_sealed_archive_handoff_marker_receipt_not_ready" | "final_sealed_archive_handoff_marker_ref_invalid" | "final_sealed_archive_handoff_marker_product_log_evidence_ref_invalid" | "final_sealed_archive_handoff_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerInput {
    operatorSealedCompletionArchiveReceipt: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt;
    sanitizedFinalSealedArchiveHandoffMarkerRef: string;
    productLogEvidenceRef: string;
    finalSealedArchiveHandoffAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.v1";
    method: "browser.active_tab_info";
    status: "final_sealed_archive_handoff_marker_ready" | "blocked";
    reasonCode: "active_tab_info_final_sealed_archive_handoff_marker_ready" | "active_tab_info_final_sealed_archive_handoff_marker_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerBlockingReasonCode[];
    marker?: Readonly<{
        finalSealedArchiveHandoffMarkerId: string;
        operatorSealedCompletionArchiveReceiptId: string;
        sanitizedFinalSealedArchiveHandoffMarkerRef: string;
        productLogEvidenceRef: string;
        finalSealedArchiveHandoffAcknowledgementRef: string;
        markerStatus: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker(input: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerInput): YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.d.ts.map