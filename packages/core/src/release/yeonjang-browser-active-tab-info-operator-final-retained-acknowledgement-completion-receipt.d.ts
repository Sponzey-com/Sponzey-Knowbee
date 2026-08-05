import type { YeonjangBrowserActiveTabInfoFinalAcknowledgementLedger } from "./yeonjang-browser-active-tab-info-final-acknowledgement-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceiptBlockingReasonCode = "operator_final_retained_acknowledgement_completion_receipt_ledger_not_ready" | "operator_final_retained_acknowledgement_completion_receipt_ref_invalid" | "operator_final_retained_acknowledgement_completion_receipt_product_log_evidence_ref_invalid" | "operator_final_retained_acknowledgement_completion_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceiptInput {
    finalAcknowledgementLedger: YeonjangBrowserActiveTabInfoFinalAcknowledgementLedger;
    sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetainedAcknowledgementCompletionRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retained_acknowledgement_completion_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retained_acknowledgement_completion_receipt_ready" | "active_tab_info_operator_final_retained_acknowledgement_completion_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetainedAcknowledgementCompletionReceiptId: string;
        finalAcknowledgementLedgerId: string;
        sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetainedAcknowledgementCompletionRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.d.ts.map