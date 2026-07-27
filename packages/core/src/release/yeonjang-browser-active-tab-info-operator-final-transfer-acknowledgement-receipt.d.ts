import type { YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger } from "./yeonjang-browser-active-tab-info-final-transfer-closeout-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceiptBlockingReasonCode = "operator_final_transfer_acknowledgement_receipt_ledger_not_ready" | "operator_final_transfer_acknowledgement_receipt_ref_invalid" | "operator_final_transfer_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_final_transfer_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceiptInput {
    finalTransferCloseoutLedger: YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger;
    sanitizedOperatorFinalTransferAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalTransferAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_transfer_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_transfer_acknowledgement_receipt_ready" | "active_tab_info_operator_final_transfer_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalTransferAcknowledgementReceiptId: string;
        finalTransferCloseoutLedgerId: string;
        sanitizedOperatorFinalTransferAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalTransferAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.d.ts.map