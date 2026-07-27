import type { YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger } from "./yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.js";
export type YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceiptBlockingReasonCode = "operator_retained_ledger_acknowledgement_receipt_ledger_not_ready" | "operator_retained_ledger_acknowledgement_receipt_ref_invalid" | "operator_retained_ledger_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_retained_ledger_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceiptInput {
    finalRetainedCompletionAcknowledgementLedger: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger;
    sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorRetainedLedgerAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-retained-ledger-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_retained_ledger_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_retained_ledger_acknowledgement_receipt_ready" | "active_tab_info_operator_retained_ledger_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorRetainedLedgerAcknowledgementReceiptId: string;
        finalRetainedCompletionAcknowledgementLedgerId: string;
        sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorRetainedLedgerAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-retained-ledger-acknowledgement-receipt.d.ts.map