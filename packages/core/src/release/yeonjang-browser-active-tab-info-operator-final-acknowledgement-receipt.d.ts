import type { YeonjangBrowserActiveTabInfoFinalCompletionLedger } from "./yeonjang-browser-active-tab-info-final-completion-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceiptBlockingReasonCode = "operator_final_acknowledgement_receipt_ledger_not_ready" | "operator_final_acknowledgement_receipt_ref_invalid" | "operator_final_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_final_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceiptInput {
    finalCompletionLedger: YeonjangBrowserActiveTabInfoFinalCompletionLedger;
    sanitizedOperatorFinalAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_acknowledgement_receipt_ready" | "active_tab_info_operator_final_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalAcknowledgementReceiptId: string;
        finalCompletionLedgerId: string;
        sanitizedOperatorFinalAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-acknowledgement-receipt.d.ts.map