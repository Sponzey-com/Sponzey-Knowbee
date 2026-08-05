import type { YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt } from "./yeonjang-browser-active-tab-info-operator-final-completion-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalCompletionLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalCompletionLedgerBlockingReasonCode = "final_completion_ledger_receipt_not_ready" | "final_completion_ledger_ref_invalid" | "final_completion_ledger_product_log_evidence_ref_invalid" | "final_completion_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalCompletionLedgerInput {
    operatorFinalCompletionReceipt: YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt;
    sanitizedFinalCompletionLedgerRef: string;
    productLogEvidenceRef: string;
    finalCompletionRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalCompletionLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-completion-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_completion_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_completion_ledger_ready" | "active_tab_info_final_completion_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalCompletionLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalCompletionLedgerId: string;
        operatorFinalCompletionReceiptId: string;
        sanitizedFinalCompletionLedgerRef: string;
        productLogEvidenceRef: string;
        finalCompletionRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalCompletionLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalCompletionLedger(input: YeonjangBrowserActiveTabInfoFinalCompletionLedgerInput): YeonjangBrowserActiveTabInfoFinalCompletionLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-completion-ledger.d.ts.map