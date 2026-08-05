import type { YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement } from "./yeonjang-browser-active-tab-info-operator-completion-archive-acknowledgement.js";
export type YeonjangBrowserActiveTabInfoFinalCompletionArchiveSealStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalCompletionArchiveSealBlockingReasonCode = "final_completion_archive_seal_acknowledgement_not_ready" | "final_completion_archive_seal_ref_invalid" | "final_completion_archive_seal_product_log_evidence_ref_invalid" | "final_completion_archive_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalCompletionArchiveSealInput {
    operatorCompletionArchiveAcknowledgement: YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement;
    sanitizedFinalCompletionArchiveSealRef: string;
    productLogEvidenceRef: string;
    finalCompletionArchiveAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-completion-archive-seal.v1";
    method: "browser.active_tab_info";
    status: "final_completion_archive_seal_ready" | "blocked";
    reasonCode: "active_tab_info_final_completion_archive_seal_ready" | "active_tab_info_final_completion_archive_seal_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalCompletionArchiveSealBlockingReasonCode[];
    seal?: Readonly<{
        finalCompletionArchiveSealId: string;
        operatorCompletionArchiveAcknowledgementId: string;
        sanitizedFinalCompletionArchiveSealRef: string;
        productLogEvidenceRef: string;
        finalCompletionArchiveAcknowledgementRef: string;
        sealStatus: YeonjangBrowserActiveTabInfoFinalCompletionArchiveSealStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal(input: YeonjangBrowserActiveTabInfoFinalCompletionArchiveSealInput): YeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-completion-archive-seal.d.ts.map