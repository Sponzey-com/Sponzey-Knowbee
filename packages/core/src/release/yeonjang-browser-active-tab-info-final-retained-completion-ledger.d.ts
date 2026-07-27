import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerBlockingReasonCode = "final_retained_completion_ledger_receipt_not_ready" | "final_retained_completion_ledger_ref_invalid" | "final_retained_completion_ledger_product_log_evidence_ref_invalid" | "final_retained_completion_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerInput {
    operatorFinalRetainedCompletionReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt;
    sanitizedFinalRetainedCompletionLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedCompletionRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_completion_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_completion_ledger_ready" | "active_tab_info_final_retained_completion_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedCompletionLedgerId: string;
        operatorFinalRetainedCompletionReceiptId: string;
        sanitizedFinalRetainedCompletionLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedCompletionRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-completion-ledger.d.ts.map