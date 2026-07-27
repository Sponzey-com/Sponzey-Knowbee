import type { YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt } from "./yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerBlockingReasonCode = "final_audit_release_closure_ledger_handoff_receipt_not_ready" | "final_audit_release_closure_ledger_ref_invalid" | "final_audit_release_closure_ledger_product_log_evidence_ref_invalid" | "final_audit_release_closure_ledger_audit_archive_closure_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerInput {
    finalAuditReleaseHandoffReceipt: YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt;
    sanitizedReleaseClosureLedgerRef: string;
    productLogEvidenceRef: string;
    auditArchiveClosureAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-release-closure-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_audit_release_closure_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_audit_release_closure_ledger_ready" | "active_tab_info_final_audit_release_closure_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalAuditReleaseClosureLedgerId: string;
        finalAuditReleaseHandoffReceiptId: string;
        sanitizedReleaseClosureLedgerRef: string;
        productLogEvidenceRef: string;
        auditArchiveClosureAcknowledgementRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger(input: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerInput): YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-audit-release-closure-ledger.d.ts.map