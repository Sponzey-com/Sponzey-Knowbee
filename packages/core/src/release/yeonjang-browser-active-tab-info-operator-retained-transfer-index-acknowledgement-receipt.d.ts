import type { YeonjangBrowserActiveTabInfoFinalRetainedTransferIndex } from "./yeonjang-browser-active-tab-info-final-retained-transfer-index.js";
export type YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptBlockingReasonCode = "operator_retained_transfer_index_acknowledgement_receipt_index_not_ready" | "operator_retained_transfer_index_acknowledgement_receipt_ref_invalid" | "operator_retained_transfer_index_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_retained_transfer_index_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptInput {
    finalRetainedTransferIndex: YeonjangBrowserActiveTabInfoFinalRetainedTransferIndex;
    sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorRetainedTransferAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_retained_transfer_index_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_retained_transfer_index_acknowledgement_receipt_ready" | "active_tab_info_operator_retained_transfer_index_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorRetainedTransferIndexAcknowledgementReceiptId: string;
        finalRetainedTransferIndexId: string;
        sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorRetainedTransferAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.d.ts.map