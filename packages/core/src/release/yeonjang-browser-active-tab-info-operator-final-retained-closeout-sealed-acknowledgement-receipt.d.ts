import type { YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger } from "./yeonjang-browser-active-tab-info-final-retained-closeout-sealed-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptBlockingReasonCode = "operator_final_retained_closeout_sealed_acknowledgement_receipt_ledger_not_ready" | "operator_final_retained_closeout_sealed_acknowledgement_receipt_ref_invalid" | "operator_final_retained_closeout_sealed_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_final_retained_closeout_sealed_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptInput {
    finalRetainedCloseoutSealedLedger: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger;
    sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetainedCloseoutSealedAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retained_closeout_sealed_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retained_closeout_sealed_acknowledgement_receipt_ready" | "active_tab_info_operator_final_retained_closeout_sealed_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId: string;
        finalRetainedCloseoutSealedLedgerId: string;
        sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetainedCloseoutSealedAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.d.ts.map