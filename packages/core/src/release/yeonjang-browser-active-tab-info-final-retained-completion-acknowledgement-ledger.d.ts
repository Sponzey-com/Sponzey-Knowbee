import type { YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerBlockingReasonCode = "final_retained_completion_acknowledgement_ledger_receipt_not_ready" | "final_retained_completion_acknowledgement_ledger_ref_invalid" | "final_retained_completion_acknowledgement_ledger_product_log_evidence_ref_invalid" | "final_retained_completion_acknowledgement_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerInput {
    operatorRetainedCompletionAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt;
    sanitizedFinalRetainedCompletionAcknowledgementLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedCompletionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_completion_acknowledgement_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_completion_acknowledgement_ledger_ready" | "active_tab_info_final_retained_completion_acknowledgement_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedCompletionAcknowledgementLedgerId: string;
        operatorRetainedCompletionAcknowledgementReceiptId: string;
        sanitizedFinalRetainedCompletionAcknowledgementLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedCompletionAcknowledgementRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.d.ts.map