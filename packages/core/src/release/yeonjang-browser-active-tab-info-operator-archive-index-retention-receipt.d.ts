import type { YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer } from "./yeonjang-browser-active-tab-info-final-release-archive-index-pointer.js";
export type YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceiptBlockingReasonCode = "operator_archive_index_retention_receipt_pointer_not_ready" | "operator_archive_index_retention_receipt_ref_invalid" | "operator_archive_index_retention_receipt_product_log_evidence_ref_invalid" | "operator_archive_index_retention_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceiptInput {
    finalReleaseArchiveIndexPointer: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer;
    sanitizedArchiveIndexRetentionReceiptRef: string;
    productLogEvidenceRef: string;
    operatorRetentionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_archive_index_retention_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_archive_index_retention_receipt_ready" | "active_tab_info_operator_archive_index_retention_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorArchiveIndexRetentionReceiptId: string;
        finalReleaseArchiveIndexPointerId: string;
        sanitizedArchiveIndexRetentionReceiptRef: string;
        productLogEvidenceRef: string;
        operatorRetentionAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt(input: YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceiptInput): YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.d.ts.map