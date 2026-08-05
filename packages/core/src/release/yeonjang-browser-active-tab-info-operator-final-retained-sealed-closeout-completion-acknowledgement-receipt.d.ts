import type { YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger } from "./yeonjang-browser-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptBlockingReasonCode = "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ledger_not_ready" | "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ref_invalid" | "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptInput {
    finalRetainedSealedCloseoutAcknowledgementLedger: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger;
    sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-completion-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ready" | "active_tab_info_operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptId: string;
        finalRetainedSealedCloseoutAcknowledgementLedgerId: string;
        sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-completion-acknowledgement-receipt.d.ts.map