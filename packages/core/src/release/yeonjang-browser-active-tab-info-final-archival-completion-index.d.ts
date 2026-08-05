import type { YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement } from "./yeonjang-browser-active-tab-info-operator-archived-release-acknowledgement.js";
export type YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndexStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndexBlockingReasonCode = "final_archival_completion_index_acknowledgement_not_ready" | "final_archival_completion_index_ref_invalid" | "final_archival_completion_index_product_log_evidence_ref_invalid" | "archival_completion_retention_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndexInput {
    operatorArchivedReleaseAcknowledgement: YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement;
    sanitizedArchivalCompletionIndexRef: string;
    productLogEvidenceRef: string;
    archivalCompletionRetentionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archival-completion-index.v1";
    method: "browser.active_tab_info";
    status: "final_archival_completion_index_ready" | "blocked";
    reasonCode: "active_tab_info_final_archival_completion_index_ready" | "active_tab_info_final_archival_completion_index_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndexBlockingReasonCode[];
    index?: Readonly<{
        finalArchivalCompletionIndexId: string;
        operatorArchivedReleaseAcknowledgementId: string;
        sanitizedArchivalCompletionIndexRef: string;
        productLogEvidenceRef: string;
        archivalCompletionRetentionAcknowledgementRef: string;
        indexStatus: YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndexStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex(input: YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndexInput): YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-archival-completion-index.d.ts.map