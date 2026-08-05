import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerBlockingReasonCode = "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_not_ready" | "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ref_invalid" | "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_product_log_evidence_ref_invalid" | "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerInput {
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt;
    sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ready" | "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId: string;
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId: string;
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger.d.ts.map