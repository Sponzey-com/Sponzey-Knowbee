import type { YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger } from "./yeonjang-browser-active-tab-info-final-retained-closeout-completion-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptBlockingReasonCode = "operator_final_retained_closeout_completion_acknowledgement_receipt_ledger_not_ready" | "operator_final_retained_closeout_completion_acknowledgement_receipt_ref_invalid" | "operator_final_retained_closeout_completion_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_final_retained_closeout_completion_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptInput {
    finalRetainedCloseoutCompletionLedger: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger;
    sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetainedCloseoutCompletionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retained_closeout_completion_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retained_closeout_completion_acknowledgement_receipt_ready" | "active_tab_info_operator_final_retained_closeout_completion_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId: string;
        finalRetainedCloseoutCompletionLedgerId: string;
        sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetainedCloseoutCompletionAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt.d.ts.map