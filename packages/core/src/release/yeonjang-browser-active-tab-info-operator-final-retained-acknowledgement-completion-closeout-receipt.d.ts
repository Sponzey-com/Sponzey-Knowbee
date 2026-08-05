import type { YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger } from "./yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptBlockingReasonCode = "operator_final_retained_acknowledgement_completion_closeout_receipt_ledger_not_ready" | "operator_final_retained_acknowledgement_completion_closeout_receipt_ref_invalid" | "operator_final_retained_acknowledgement_completion_closeout_receipt_product_log_evidence_ref_invalid" | "operator_final_retained_acknowledgement_completion_closeout_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptInput {
    finalRetainedAcknowledgementCompletionLedger: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger;
    sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetainedAcknowledgementCompletionCloseoutRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retained_acknowledgement_completion_closeout_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_receipt_ready" | "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId: string;
        finalRetainedAcknowledgementCompletionLedgerId: string;
        sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetainedAcknowledgementCompletionCloseoutRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-receipt.d.ts.map