import type { YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointerBlockingReasonCode = "final_post_transfer_archive_pointer_receipt_not_ready" | "final_post_transfer_archive_pointer_ref_invalid" | "final_post_transfer_archive_pointer_product_log_evidence_ref_invalid" | "final_post_transfer_archive_pointer_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointerInput {
    operatorFinalTransferAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt;
    sanitizedPostTransferArchivePointerRef: string;
    productLogEvidenceRef: string;
    archiveTransferAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.v1";
    method: "browser.active_tab_info";
    status: "final_post_transfer_archive_pointer_ready" | "blocked";
    reasonCode: "active_tab_info_final_post_transfer_archive_pointer_ready" | "active_tab_info_final_post_transfer_archive_pointer_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointerBlockingReasonCode[];
    pointer?: Readonly<{
        finalPostTransferArchivePointerId: string;
        operatorFinalTransferAcknowledgementReceiptId: string;
        sanitizedPostTransferArchivePointerRef: string;
        productLogEvidenceRef: string;
        archiveTransferAcknowledgementRef: string;
        pointerStatus: YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer(input: YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointerInput): YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.d.ts.map