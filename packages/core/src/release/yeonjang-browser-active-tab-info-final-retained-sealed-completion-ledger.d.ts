import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-sealed-completion-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerBlockingReasonCode = "final_retained_sealed_completion_ledger_receipt_not_ready" | "final_retained_sealed_completion_ledger_ref_invalid" | "final_retained_sealed_completion_ledger_product_log_evidence_ref_invalid" | "final_retained_sealed_completion_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerInput {
    operatorFinalRetainedSealedCompletionReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt;
    sanitizedFinalRetainedSealedCompletionLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedSealedCompletionRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-completion-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_sealed_completion_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_sealed_completion_ledger_ready" | "active_tab_info_final_retained_sealed_completion_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedSealedCompletionLedgerId: string;
        operatorFinalRetainedSealedCompletionReceiptId: string;
        sanitizedFinalRetainedSealedCompletionLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedSealedCompletionRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-sealed-completion-ledger.d.ts.map