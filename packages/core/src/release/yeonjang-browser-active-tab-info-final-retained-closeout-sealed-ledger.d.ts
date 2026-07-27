import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-completion-closeout-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerBlockingReasonCode = "final_retained_closeout_sealed_ledger_receipt_not_ready" | "final_retained_closeout_sealed_ledger_ref_invalid" | "final_retained_closeout_sealed_ledger_product_log_evidence_ref_invalid" | "final_retained_closeout_sealed_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerInput {
    operatorFinalRetainedCompletionCloseoutAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt;
    sanitizedFinalRetainedCloseoutSealedLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedCloseoutSealedRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-sealed-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_closeout_sealed_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_closeout_sealed_ledger_ready" | "active_tab_info_final_retained_closeout_sealed_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedCloseoutSealedLedgerId: string;
        operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId: string;
        sanitizedFinalRetainedCloseoutSealedLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedCloseoutSealedRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-closeout-sealed-ledger.d.ts.map