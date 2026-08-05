import type { YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker } from "./yeonjang-browser-active-tab-info-final-operator-archive-completion-marker.js";
export type YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgementStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgementBlockingReasonCode = "operator_completion_archive_acknowledgement_marker_not_ready" | "operator_completion_archive_acknowledgement_ref_invalid" | "operator_completion_archive_acknowledgement_product_log_evidence_ref_invalid" | "operator_completion_archive_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgementInput {
    finalOperatorArchiveCompletionMarker: YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker;
    sanitizedOperatorCompletionArchiveAcknowledgementRef: string;
    productLogEvidenceRef: string;
    operatorCompletionArchiveAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-completion-archive-acknowledgement.v1";
    method: "browser.active_tab_info";
    status: "operator_completion_archive_acknowledgement_ready" | "blocked";
    reasonCode: "active_tab_info_operator_completion_archive_acknowledgement_ready" | "active_tab_info_operator_completion_archive_acknowledgement_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgementBlockingReasonCode[];
    acknowledgement?: Readonly<{
        operatorCompletionArchiveAcknowledgementId: string;
        finalOperatorArchiveCompletionMarkerId: string;
        sanitizedOperatorCompletionArchiveAcknowledgementRef: string;
        productLogEvidenceRef: string;
        operatorCompletionArchiveAcknowledgementRef: string;
        acknowledgementStatus: YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgementStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement(input: YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgementInput): YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-completion-archive-acknowledgement.d.ts.map