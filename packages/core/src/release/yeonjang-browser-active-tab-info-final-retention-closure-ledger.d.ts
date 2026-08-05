import type { YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt } from "./yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetentionClosureLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetentionClosureLedgerBlockingReasonCode = "final_retention_closure_ledger_receipt_not_ready" | "final_retention_closure_ledger_ref_invalid" | "final_retention_closure_ledger_product_log_evidence_ref_invalid" | "final_retention_closure_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetentionClosureLedgerInput {
    operatorFinalIndexRetentionReceipt: YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt;
    sanitizedFinalRetentionClosureLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetentionClosureAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetentionClosureLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retention-closure-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retention_closure_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retention_closure_ledger_ready" | "active_tab_info_final_retention_closure_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetentionClosureLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetentionClosureLedgerId: string;
        operatorFinalIndexRetentionReceiptId: string;
        sanitizedFinalRetentionClosureLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetentionClosureAcknowledgementRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetentionClosureLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetentionClosureLedger(input: YeonjangBrowserActiveTabInfoFinalRetentionClosureLedgerInput): YeonjangBrowserActiveTabInfoFinalRetentionClosureLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retention-closure-ledger.d.ts.map