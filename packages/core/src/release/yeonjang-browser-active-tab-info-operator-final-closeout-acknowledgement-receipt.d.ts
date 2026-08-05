import type { YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger } from "./yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptBlockingReasonCode = "operator_final_closeout_acknowledgement_receipt_ledger_not_ready" | "operator_final_closeout_acknowledgement_receipt_ref_invalid" | "operator_final_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_final_closeout_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptInput {
    finalSealedArchiveCloseoutLedger: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger;
    sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalCloseoutAcknowledgementReceiptRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_closeout_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_closeout_acknowledgement_receipt_ready" | "active_tab_info_operator_final_closeout_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalCloseoutAcknowledgementReceiptId: string;
        finalSealedArchiveCloseoutLedgerId: string;
        sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalCloseoutAcknowledgementReceiptRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.d.ts.map