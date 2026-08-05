import type { YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerBlockingReasonCode = "final_retained_acknowledgement_ledger_receipt_not_ready" | "final_retained_acknowledgement_ledger_ref_invalid" | "final_retained_acknowledgement_ledger_product_log_evidence_ref_invalid" | "final_retained_acknowledgement_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerInput {
    operatorRetainedTransferIndexAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt;
    sanitizedFinalRetainedAcknowledgementLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_acknowledgement_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_acknowledgement_ledger_ready" | "active_tab_info_final_retained_acknowledgement_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedAcknowledgementLedgerId: string;
        operatorRetainedTransferIndexAcknowledgementReceiptId: string;
        sanitizedFinalRetainedAcknowledgementLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedAcknowledgementRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-acknowledgement-ledger.d.ts.map