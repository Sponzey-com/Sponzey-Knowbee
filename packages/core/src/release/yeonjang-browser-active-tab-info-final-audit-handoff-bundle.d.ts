import type { YeonjangBrowserActiveTabInfoFinalCloseoutLedger } from "./yeonjang-browser-active-tab-info-final-closeout-ledger.js";
export type YeonjangBrowserActiveTabInfoFinalAuditHandoffStatus = "handoff_ready";
export type YeonjangBrowserActiveTabInfoFinalAuditHandoffBundleBlockingReasonCode = "final_audit_handoff_ledger_not_ready" | "final_audit_handoff_descriptor_ref_invalid" | "final_audit_handoff_product_log_evidence_ref_invalid" | "final_audit_handoff_surface_matrix_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalAuditHandoffBundleInput {
    finalCloseoutLedger: YeonjangBrowserActiveTabInfoFinalCloseoutLedger;
    sanitizedAuditArtifactDescriptorRef: string;
    productLogEvidenceRef: string;
    releaseSurfaceMatrixAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalAuditHandoffBundle = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-handoff-bundle.v1";
    method: "browser.active_tab_info";
    status: "final_audit_handoff_bundle_ready" | "blocked";
    reasonCode: "active_tab_info_final_audit_handoff_bundle_ready" | "active_tab_info_final_audit_handoff_bundle_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalAuditHandoffBundleBlockingReasonCode[];
    bundle?: Readonly<{
        finalAuditHandoffBundleId: string;
        finalCloseoutLedgerId: string;
        sanitizedAuditArtifactDescriptorRef: string;
        productLogEvidenceRef: string;
        releaseSurfaceMatrixAcknowledgementRef: string;
        handoffStatus: YeonjangBrowserActiveTabInfoFinalAuditHandoffStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalAuditHandoffBundle(input: YeonjangBrowserActiveTabInfoFinalAuditHandoffBundleInput): YeonjangBrowserActiveTabInfoFinalAuditHandoffBundle;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-audit-handoff-bundle.d.ts.map