import type { YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedTransferIndexStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedTransferIndexBlockingReasonCode = "final_retained_transfer_index_receipt_not_ready" | "final_retained_transfer_index_ref_invalid" | "final_retained_transfer_index_product_log_evidence_ref_invalid" | "final_retained_transfer_index_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedTransferIndexInput {
    operatorPostTransferArchiveAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt;
    sanitizedRetainedTransferIndexRef: string;
    productLogEvidenceRef: string;
    retentionTransferAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedTransferIndex = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-transfer-index.v1";
    method: "browser.active_tab_info";
    status: "final_retained_transfer_index_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_transfer_index_ready" | "active_tab_info_final_retained_transfer_index_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedTransferIndexBlockingReasonCode[];
    index?: Readonly<{
        finalRetainedTransferIndexId: string;
        operatorPostTransferArchiveAcknowledgementReceiptId: string;
        sanitizedRetainedTransferIndexRef: string;
        productLogEvidenceRef: string;
        retentionTransferAcknowledgementRef: string;
        indexStatus: YeonjangBrowserActiveTabInfoFinalRetainedTransferIndexStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedTransferIndex(input: YeonjangBrowserActiveTabInfoFinalRetainedTransferIndexInput): YeonjangBrowserActiveTabInfoFinalRetainedTransferIndex;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-transfer-index.d.ts.map