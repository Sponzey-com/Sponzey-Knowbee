import type { YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker } from "./yeonjang-browser-active-tab-info-final-handoff-closure-marker.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceiptBlockingReasonCode = "operator_final_handoff_receipt_marker_not_ready" | "operator_final_handoff_receipt_ref_invalid" | "operator_final_handoff_receipt_product_log_evidence_ref_invalid" | "operator_final_handoff_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceiptInput {
    finalHandoffClosureMarker: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker;
    sanitizedOperatorFinalHandoffReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalHandoffAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-handoff-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_handoff_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_handoff_receipt_ready" | "active_tab_info_operator_final_handoff_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalHandoffReceiptId: string;
        finalHandoffClosureMarkerId: string;
        sanitizedOperatorFinalHandoffReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalHandoffAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-handoff-receipt.d.ts.map