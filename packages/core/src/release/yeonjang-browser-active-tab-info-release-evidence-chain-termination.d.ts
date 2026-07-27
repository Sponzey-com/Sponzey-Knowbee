export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainTerminationInput = {
    readonly lastAcceptedBoundaryRef?: string;
    readonly releaseReadinessNow?: boolean;
    readonly enableSkillMappingNow?: boolean;
    readonly addProductionBindingNow?: boolean;
    readonly enableDefaultLiveSmokeNow?: boolean;
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-termination.v1";
    readonly method: "browser.active_tab_info";
    readonly chainStatus: "closed_for_manual_architecture_review" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_closed_for_manual_architecture_review" | "active_tab_info_release_evidence_chain_previous_boundary_incomplete" | "active_tab_info_release_evidence_chain_activation_not_allowed";
    readonly lastAcceptedBoundaryRef?: string;
    readonly nextAllowedAction: "architecture_review" | "complete_previous_boundary";
    readonly addNewReceiptLedgerPairNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
    readonly enableDefaultLiveSmokeNow: false;
};
export declare function evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainTerminationInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-termination.d.ts.map