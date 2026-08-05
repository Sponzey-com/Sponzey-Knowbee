import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-completion-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedgerBlockingReasonCode = "final_retained_sealed_closeout_completion_ledger_receipt_not_ready" | "final_retained_sealed_closeout_completion_ledger_ref_invalid" | "final_retained_sealed_closeout_completion_ledger_product_log_evidence_ref_invalid" | "final_retained_sealed_closeout_completion_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedgerInput {
    operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt;
    sanitizedFinalRetainedSealedCloseoutCompletionLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedSealedCloseoutCompletionRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-completion-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_sealed_closeout_completion_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_sealed_closeout_completion_ledger_ready" | "active_tab_info_final_retained_sealed_closeout_completion_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedSealedCloseoutCompletionLedgerId: string;
        operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptId: string;
        sanitizedFinalRetainedSealedCloseoutCompletionLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedSealedCloseoutCompletionRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-sealed-closeout-completion-ledger.d.ts.map