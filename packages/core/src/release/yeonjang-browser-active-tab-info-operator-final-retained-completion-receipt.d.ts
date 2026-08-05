import type { YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger } from "./yeonjang-browser-active-tab-info-final-retained-sealed-completion-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceiptBlockingReasonCode = "operator_final_retained_completion_receipt_ledger_not_ready" | "operator_final_retained_completion_receipt_ref_invalid" | "operator_final_retained_completion_receipt_product_log_evidence_ref_invalid" | "operator_final_retained_completion_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceiptInput {
    finalRetainedSealedCompletionLedger: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger;
    sanitizedOperatorFinalRetainedCompletionReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalRetainedCompletionRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_retained_completion_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_retained_completion_receipt_ready" | "active_tab_info_operator_final_retained_completion_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalRetainedCompletionReceiptId: string;
        finalRetainedSealedCompletionLedgerId: string;
        sanitizedOperatorFinalRetainedCompletionReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalRetainedCompletionRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.d.ts.map