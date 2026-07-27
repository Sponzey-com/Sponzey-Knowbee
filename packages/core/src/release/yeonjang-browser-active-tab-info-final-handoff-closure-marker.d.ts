import type { YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerBlockingReasonCode = "final_handoff_closure_marker_receipt_not_ready" | "final_handoff_closure_marker_ref_invalid" | "final_handoff_closure_marker_product_log_evidence_ref_invalid" | "final_handoff_closure_marker_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerInput {
    operatorFinalRetentionAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt;
    sanitizedFinalHandoffClosureMarkerRef: string;
    productLogEvidenceRef: string;
    finalHandoffClosureAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-handoff-closure-marker.v1";
    method: "browser.active_tab_info";
    status: "final_handoff_closure_marker_ready" | "blocked";
    reasonCode: "active_tab_info_final_handoff_closure_marker_ready" | "active_tab_info_final_handoff_closure_marker_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerBlockingReasonCode[];
    marker?: Readonly<{
        finalHandoffClosureMarkerId: string;
        operatorFinalRetentionAcknowledgementReceiptId: string;
        sanitizedFinalHandoffClosureMarkerRef: string;
        productLogEvidenceRef: string;
        finalHandoffClosureAcknowledgementRef: string;
        markerStatus: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalHandoffClosureMarker(input: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerInput): YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-handoff-closure-marker.d.ts.map