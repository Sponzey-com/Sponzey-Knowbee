import type { YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker } from "./yeonjang-browser-active-tab-info-final-archived-release-closure-marker.js";
export type YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementBlockingReasonCode = "operator_archived_release_acknowledgement_marker_not_ready" | "operator_archived_release_acknowledgement_ref_invalid" | "operator_archived_release_acknowledgement_product_log_evidence_ref_invalid" | "operator_archived_release_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementInput {
    finalArchivedReleaseClosureMarker: YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker;
    sanitizedArchivedReleaseAcknowledgementRef: string;
    productLogEvidenceRef: string;
    operatorArchivedReleaseAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-archived-release-acknowledgement.v1";
    method: "browser.active_tab_info";
    status: "operator_archived_release_acknowledgement_ready" | "blocked";
    reasonCode: "active_tab_info_operator_archived_release_acknowledgement_ready" | "active_tab_info_operator_archived_release_acknowledgement_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementBlockingReasonCode[];
    acknowledgement?: Readonly<{
        operatorArchivedReleaseAcknowledgementId: string;
        finalArchivedReleaseClosureMarkerId: string;
        sanitizedArchivedReleaseAcknowledgementRef: string;
        productLogEvidenceRef: string;
        operatorArchivedReleaseAcknowledgementRef: string;
        acknowledgementStatus: YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement(input: YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementInput): YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-archived-release-acknowledgement.d.ts.map