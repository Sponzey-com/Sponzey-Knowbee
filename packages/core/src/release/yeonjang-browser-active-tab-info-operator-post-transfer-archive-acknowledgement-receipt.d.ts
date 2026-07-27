import type { YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer } from "./yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.js";
export type YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptBlockingReasonCode = "operator_post_transfer_archive_acknowledgement_receipt_pointer_not_ready" | "operator_post_transfer_archive_acknowledgement_receipt_ref_invalid" | "operator_post_transfer_archive_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_post_transfer_archive_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptInput {
    finalPostTransferArchivePointer: YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer;
    sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorPostTransferArchiveAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_post_transfer_archive_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_post_transfer_archive_acknowledgement_receipt_ready" | "active_tab_info_operator_post_transfer_archive_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorPostTransferArchiveAcknowledgementReceiptId: string;
        finalPostTransferArchivePointerId: string;
        sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorPostTransferArchiveAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.d.ts.map