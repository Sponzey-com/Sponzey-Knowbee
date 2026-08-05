import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerBlockingReasonCode = "final_retained_closeout_completion_ledger_receipt_not_ready" | "final_retained_closeout_completion_ledger_ref_invalid" | "final_retained_closeout_completion_ledger_product_log_evidence_ref_invalid" | "final_retained_closeout_completion_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerInput {
    operatorFinalRetainedCloseoutAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt;
    sanitizedFinalRetainedCloseoutCompletionLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedCloseoutCompletionRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-completion-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_closeout_completion_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_closeout_completion_ledger_ready" | "active_tab_info_final_retained_closeout_completion_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedCloseoutCompletionLedgerId: string;
        operatorFinalRetainedCloseoutAcknowledgementReceiptId: string;
        sanitizedFinalRetainedCloseoutCompletionLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedCloseoutCompletionRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-closeout-completion-ledger.d.ts.map