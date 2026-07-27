import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerBlockingReasonCode = "final_retained_sealed_closeout_ledger_receipt_not_ready" | "final_retained_sealed_closeout_ledger_ref_invalid" | "final_retained_sealed_closeout_ledger_product_log_evidence_ref_invalid" | "final_retained_sealed_closeout_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerInput {
    operatorFinalRetainedCloseoutSealedAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt;
    sanitizedFinalRetainedSealedCloseoutLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedSealedCloseoutRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_sealed_closeout_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_sealed_closeout_ledger_ready" | "active_tab_info_final_retained_sealed_closeout_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedSealedCloseoutLedgerId: string;
        operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId: string;
        sanitizedFinalRetainedSealedCloseoutLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedSealedCloseoutRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-sealed-closeout-ledger.d.ts.map