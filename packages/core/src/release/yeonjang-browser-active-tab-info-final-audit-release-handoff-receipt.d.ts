import type { YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex } from "./yeonjang-browser-active-tab-info-archival-release-evidence-index.js";
export type YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceiptBlockingReasonCode = "final_audit_release_handoff_receipt_index_not_ready" | "final_audit_release_handoff_receipt_ref_invalid" | "final_audit_release_handoff_receipt_product_log_evidence_ref_invalid" | "final_audit_release_handoff_receipt_manual_audit_queue_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceiptInput {
    archivalReleaseEvidenceIndex: YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex;
    sanitizedReleaseHandoffReceiptRef: string;
    productLogEvidenceRef: string;
    manualAuditQueueAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.v1";
    method: "browser.active_tab_info";
    status: "final_audit_release_handoff_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_final_audit_release_handoff_receipt_ready" | "active_tab_info_final_audit_release_handoff_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        finalAuditReleaseHandoffReceiptId: string;
        archivalReleaseEvidenceIndexId: string;
        sanitizedReleaseHandoffReceiptRef: string;
        productLogEvidenceRef: string;
        manualAuditQueueAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt(input: YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceiptInput): YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.d.ts.map