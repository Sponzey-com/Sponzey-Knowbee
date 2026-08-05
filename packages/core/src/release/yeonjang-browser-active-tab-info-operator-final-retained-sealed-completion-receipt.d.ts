import type { YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedger } from "./yeonjang-browser-active-tab-info-final-retained-sealed-closeout-completion-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceiptBlockingReasonCode = "operator_final_retained_sealed_completion_receipt_ledger_not_ready" | "operator_final_retained_sealed_completion_receipt_ref_invalid" | "operator_final_retained_sealed_completion_receipt_product_log_evidence_ref_invalid" | "operator_final_retained_sealed_completion_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceiptInput {
    finalRetainedSealedCloseoutCompletionLedger: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedger;
    sanitizedOperatorFinalRetainedSealedCompletionReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetainedSealedCompletionRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-sealed-completion-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retained_sealed_completion_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retained_sealed_completion_receipt_ready" | "active_tab_info_operator_final_retained_sealed_completion_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetainedSealedCompletionReceiptId: string;
        finalRetainedSealedCloseoutCompletionLedgerId: string;
        sanitizedOperatorFinalRetainedSealedCompletionReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetainedSealedCompletionRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-sealed-completion-receipt.d.ts.map