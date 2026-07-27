import type { YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger } from "./yeonjang-browser-active-tab-info-final-retained-completion-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceiptBlockingReasonCode = "operator_final_completion_receipt_ledger_not_ready" | "operator_final_completion_receipt_ref_invalid" | "operator_final_completion_receipt_product_log_evidence_ref_invalid" | "operator_final_completion_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceiptInput {
    finalRetainedCompletionLedger: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger;
    sanitizedOperatorFinalCompletionReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalCompletionRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-completion-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_completion_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_completion_receipt_ready" | "active_tab_info_operator_final_completion_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalCompletionReceiptId: string;
        finalRetainedCompletionLedgerId: string;
        sanitizedOperatorFinalCompletionReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalCompletionRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-completion-receipt.d.ts.map