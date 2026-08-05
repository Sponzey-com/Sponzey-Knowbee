import type { YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger } from "./yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptBlockingReasonCode = "operator_final_retained_closeout_acknowledgement_receipt_ledger_not_ready" | "operator_final_retained_closeout_acknowledgement_receipt_ref_invalid" | "operator_final_retained_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_final_retained_closeout_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptInput {
    finalRetainedCloseoutAcknowledgementLedger: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger;
    sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetainedCloseoutAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retained_closeout_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retained_closeout_acknowledgement_receipt_ready" | "active_tab_info_operator_final_retained_closeout_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetainedCloseoutAcknowledgementReceiptId: string;
        finalRetainedCloseoutAcknowledgementLedgerId: string;
        sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetainedCloseoutAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.d.ts.map