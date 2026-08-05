import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerBlockingReasonCode = "final_retained_sealed_closeout_acknowledgement_ledger_receipt_not_ready" | "final_retained_sealed_closeout_acknowledgement_ledger_ref_invalid" | "final_retained_sealed_closeout_acknowledgement_ledger_product_log_evidence_ref_invalid" | "final_retained_sealed_closeout_acknowledgement_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerInput {
    operatorFinalRetainedSealedCloseoutAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceipt;
    sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedSealedCloseoutAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_sealed_closeout_acknowledgement_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_sealed_closeout_acknowledgement_ledger_ready" | "active_tab_info_final_retained_sealed_closeout_acknowledgement_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedSealedCloseoutAcknowledgementLedgerId: string;
        operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId: string;
        sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedSealedCloseoutAcknowledgementRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.d.ts.map