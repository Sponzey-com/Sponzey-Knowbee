import type { YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger } from "./yeonjang-browser-active-tab-info-final-retained-acknowledgement-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptBlockingReasonCode = "operator_final_retained_acknowledgement_receipt_ledger_not_ready" | "operator_final_retained_acknowledgement_receipt_ref_invalid" | "operator_final_retained_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_final_retained_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptInput {
    finalRetainedAcknowledgementLedger: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger;
    sanitizedOperatorFinalRetainedAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetainedAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retained_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retained_acknowledgement_receipt_ready" | "active_tab_info_operator_final_retained_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetainedAcknowledgementReceiptId: string;
        finalRetainedAcknowledgementLedgerId: string;
        sanitizedOperatorFinalRetainedAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetainedAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-receipt.d.ts.map