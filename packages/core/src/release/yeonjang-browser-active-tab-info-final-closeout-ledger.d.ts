import type { YeonjangBrowserActiveTabInfoOperatorCloseoutNote } from "./yeonjang-browser-active-tab-info-operator-closeout-note.js";
export type YeonjangBrowserActiveTabInfoFinalCloseoutLedgerStatus = "closed";
export type YeonjangBrowserActiveTabInfoFinalCloseoutLedgerBlockingReasonCode = "final_closeout_operator_note_not_ready" | "final_closeout_completion_audit_summary_ref_invalid" | "final_closeout_terminal_delivery_receipt_ref_invalid" | "final_closeout_product_log_evidence_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalCloseoutLedgerInput {
    operatorCloseoutNote: YeonjangBrowserActiveTabInfoOperatorCloseoutNote;
    completionAuditSummaryRef: string;
    terminalDeliveryReceiptRef: string;
    productLogEvidenceRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalCloseoutLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-closeout-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_closeout_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_closeout_ledger_ready" | "active_tab_info_final_closeout_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalCloseoutLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalCloseoutLedgerId: string;
        operatorCloseoutNoteId: string;
        completionAuditSummaryRef: string;
        terminalDeliveryReceiptRef: string;
        productLogEvidenceRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalCloseoutLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalCloseoutLedger(input: YeonjangBrowserActiveTabInfoFinalCloseoutLedgerInput): YeonjangBrowserActiveTabInfoFinalCloseoutLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-closeout-ledger.d.ts.map