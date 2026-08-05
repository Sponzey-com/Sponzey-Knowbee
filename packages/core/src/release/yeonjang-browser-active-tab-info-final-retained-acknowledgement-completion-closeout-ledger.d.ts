import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedgerBlockingReasonCode = "final_retained_acknowledgement_completion_closeout_ledger_receipt_not_ready" | "final_retained_acknowledgement_completion_closeout_ledger_ref_invalid" | "final_retained_acknowledgement_completion_closeout_ledger_product_log_evidence_ref_invalid" | "final_retained_acknowledgement_completion_closeout_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedgerInput {
    operatorFinalRetainedAcknowledgementCompletionCloseoutReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt;
    sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedAcknowledgementCompletionCloseoutRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_acknowledgement_completion_closeout_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_acknowledgement_completion_closeout_ledger_ready" | "active_tab_info_final_retained_acknowledgement_completion_closeout_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedAcknowledgementCompletionCloseoutLedgerId: string;
        operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId: string;
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedAcknowledgementCompletionCloseoutRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-ledger.d.ts.map