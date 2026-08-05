import type { YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger } from "./yeonjang-browser-active-tab-info-final-retained-completion-closeout-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptBlockingReasonCode = "operator_final_retained_completion_closeout_acknowledgement_receipt_ledger_not_ready" | "operator_final_retained_completion_closeout_acknowledgement_receipt_ref_invalid" | "operator_final_retained_completion_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_final_retained_completion_closeout_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptInput {
    finalRetainedCompletionCloseoutLedger: YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger;
    sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetainedCompletionCloseoutAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-completion-closeout-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retained_completion_closeout_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retained_completion_closeout_acknowledgement_receipt_ready" | "active_tab_info_operator_final_retained_completion_closeout_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId: string;
        finalRetainedCompletionCloseoutLedgerId: string;
        sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetainedCompletionCloseoutAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-completion-closeout-acknowledgement-receipt.d.ts.map