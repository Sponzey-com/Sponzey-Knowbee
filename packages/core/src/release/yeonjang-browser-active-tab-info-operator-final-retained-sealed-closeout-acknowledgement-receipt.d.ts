import type { YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger } from "./yeonjang-browser-active-tab-info-final-retained-sealed-closeout-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceiptBlockingReasonCode = "operator_final_retained_sealed_closeout_acknowledgement_receipt_ledger_not_ready" | "operator_final_retained_sealed_closeout_acknowledgement_receipt_ref_invalid" | "operator_final_retained_sealed_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_final_retained_sealed_closeout_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceiptInput {
    finalRetainedSealedCloseoutLedger: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger;
    sanitizedOperatorFinalRetainedSealedCloseoutAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetainedSealedCloseoutAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retained_sealed_closeout_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retained_sealed_closeout_acknowledgement_receipt_ready" | "active_tab_info_operator_final_retained_sealed_closeout_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId: string;
        finalRetainedSealedCloseoutLedgerId: string;
        sanitizedOperatorFinalRetainedSealedCloseoutAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetainedSealedCloseoutAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-acknowledgement-receipt.d.ts.map