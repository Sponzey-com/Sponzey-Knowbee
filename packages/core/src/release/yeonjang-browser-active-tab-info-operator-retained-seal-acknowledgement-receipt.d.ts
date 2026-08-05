import type { YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal } from "./yeonjang-browser-active-tab-info-final-retained-ledger-acknowledgement-seal.js";
export type YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceiptBlockingReasonCode = "operator_retained_seal_acknowledgement_receipt_seal_not_ready" | "operator_retained_seal_acknowledgement_receipt_ref_invalid" | "operator_retained_seal_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_retained_seal_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceiptInput {
    finalRetainedLedgerAcknowledgementSeal: YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal;
    sanitizedOperatorRetainedSealAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorRetainedSealAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_retained_seal_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_retained_seal_acknowledgement_receipt_ready" | "active_tab_info_operator_retained_seal_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorRetainedSealAcknowledgementReceiptId: string;
        finalRetainedLedgerAcknowledgementSealId: string;
        sanitizedOperatorRetainedSealAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorRetainedSealAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.d.ts.map