import type { YeonjangBrowserActiveTabInfoFinalArchivalPointer } from "./yeonjang-browser-active-tab-info-final-archival-pointer.js";
export type YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndexStatus = "ready";
export type YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndexBlockingReasonCode = "archival_release_evidence_index_pointer_not_ready" | "archival_release_evidence_index_ref_invalid" | "archival_release_evidence_index_product_log_evidence_ref_invalid" | "archival_release_evidence_index_audit_retrieval_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndexInput {
    finalArchivalPointer: YeonjangBrowserActiveTabInfoFinalArchivalPointer;
    sanitizedEvidenceIndexRef: string;
    productLogEvidenceRef: string;
    auditRetrievalAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-archival-release-evidence-index.v1";
    method: "browser.active_tab_info";
    status: "archival_release_evidence_index_ready" | "blocked";
    reasonCode: "active_tab_info_archival_release_evidence_index_ready" | "active_tab_info_archival_release_evidence_index_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndexBlockingReasonCode[];
    index?: Readonly<{
        archivalReleaseEvidenceIndexId: string;
        finalArchivalPointerId: string;
        sanitizedEvidenceIndexRef: string;
        productLogEvidenceRef: string;
        auditRetrievalAcknowledgementRef: string;
        indexStatus: YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndexStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex(input: YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndexInput): YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex;
//# sourceMappingURL=yeonjang-browser-active-tab-info-archival-release-evidence-index.d.ts.map