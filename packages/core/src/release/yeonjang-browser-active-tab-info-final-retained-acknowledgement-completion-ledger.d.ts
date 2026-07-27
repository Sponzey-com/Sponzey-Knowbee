import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedgerBlockingReasonCode = "final_retained_acknowledgement_completion_ledger_receipt_not_ready" | "final_retained_acknowledgement_completion_ledger_ref_invalid" | "final_retained_acknowledgement_completion_ledger_product_log_evidence_ref_invalid" | "final_retained_acknowledgement_completion_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedgerInput {
    operatorFinalRetainedAcknowledgementCompletionReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt;
    sanitizedFinalRetainedAcknowledgementCompletionLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedAcknowledgementCompletionRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_acknowledgement_completion_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_acknowledgement_completion_ledger_ready" | "active_tab_info_final_retained_acknowledgement_completion_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedAcknowledgementCompletionLedgerId: string;
        operatorFinalRetainedAcknowledgementCompletionReceiptId: string;
        sanitizedFinalRetainedAcknowledgementCompletionLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedAcknowledgementCompletionRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.d.ts.map