import type { YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker } from "./yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.js";
export type YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptBlockingReasonCode = "operator_sealed_archive_handoff_receipt_marker_not_ready" | "operator_sealed_archive_handoff_receipt_ref_invalid" | "operator_sealed_archive_handoff_receipt_product_log_evidence_ref_invalid" | "operator_sealed_archive_handoff_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptInput {
    finalSealedArchiveHandoffMarker: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker;
    sanitizedOperatorSealedArchiveHandoffReceiptRef: string;
    productLogEvidenceRef: string;
    operatorSealedArchiveHandoffReceiptRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-sealed-archive-handoff-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_sealed_archive_handoff_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_sealed_archive_handoff_receipt_ready" | "active_tab_info_operator_sealed_archive_handoff_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorSealedArchiveHandoffReceiptId: string;
        finalSealedArchiveHandoffMarkerId: string;
        sanitizedOperatorSealedArchiveHandoffReceiptRef: string;
        productLogEvidenceRef: string;
        operatorSealedArchiveHandoffReceiptRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt(input: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptInput): YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-sealed-archive-handoff-receipt.d.ts.map