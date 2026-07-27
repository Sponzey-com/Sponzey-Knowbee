import type { YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex } from "./yeonjang-browser-active-tab-info-final-operator-closeout-index.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceiptBlockingReasonCode = "operator_final_index_retention_receipt_index_not_ready" | "operator_final_index_retention_receipt_ref_invalid" | "operator_final_index_retention_receipt_product_log_evidence_ref_invalid" | "operator_final_index_retention_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceiptInput {
    finalOperatorCloseoutIndex: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex;
    sanitizedOperatorFinalIndexRetentionReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalIndexRetentionReceiptRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_index_retention_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_index_retention_receipt_ready" | "active_tab_info_operator_final_index_retention_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalIndexRetentionReceiptId: string;
        finalOperatorCloseoutIndexId: string;
        sanitizedOperatorFinalIndexRetentionReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalIndexRetentionReceiptRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.d.ts.map