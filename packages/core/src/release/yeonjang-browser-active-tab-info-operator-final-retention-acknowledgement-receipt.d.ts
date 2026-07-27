import type { YeonjangBrowserActiveTabInfoFinalRetentionClosureLedger } from "./yeonjang-browser-active-tab-info-final-retention-closure-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptBlockingReasonCode = "operator_final_retention_acknowledgement_receipt_ledger_not_ready" | "operator_final_retention_acknowledgement_receipt_ref_invalid" | "operator_final_retention_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_final_retention_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptInput {
    finalRetentionClosureLedger: YeonjangBrowserActiveTabInfoFinalRetentionClosureLedger;
    sanitizedOperatorFinalRetentionAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetentionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retention_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retention_acknowledgement_receipt_ready" | "active_tab_info_operator_final_retention_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetentionAcknowledgementReceiptId: string;
        finalRetentionClosureLedgerId: string;
        sanitizedOperatorFinalRetentionAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetentionAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.d.ts.map