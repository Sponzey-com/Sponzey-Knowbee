import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedgerBlockingReasonCode = "final_retained_completion_closeout_ledger_receipt_not_ready" | "final_retained_completion_closeout_ledger_ref_invalid" | "final_retained_completion_closeout_ledger_product_log_evidence_ref_invalid" | "final_retained_completion_closeout_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedgerInput {
    operatorFinalRetainedCloseoutCompletionAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt;
    sanitizedFinalRetainedCompletionCloseoutLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedCompletionCloseoutRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-closeout-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_completion_closeout_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_completion_closeout_ledger_ready" | "active_tab_info_final_retained_completion_closeout_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedCompletionCloseoutLedgerId: string;
        operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId: string;
        sanitizedFinalRetainedCompletionCloseoutLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedCompletionCloseoutRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-completion-closeout-ledger.d.ts.map