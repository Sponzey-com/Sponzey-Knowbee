import type { YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger } from "./yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptBlockingReasonCode = "operator_retained_closeout_acknowledgement_receipt_ledger_not_ready" | "operator_retained_closeout_acknowledgement_receipt_ref_invalid" | "operator_retained_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_retained_closeout_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptInput {
    finalRetainedSealCloseoutLedger: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger;
    sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorRetainedCloseoutAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-retained-closeout-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_retained_closeout_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_retained_closeout_acknowledgement_receipt_ready" | "active_tab_info_operator_retained_closeout_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorRetainedCloseoutAcknowledgementReceiptId: string;
        finalRetainedSealCloseoutLedgerId: string;
        sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorRetainedCloseoutAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-retained-closeout-acknowledgement-receipt.d.ts.map