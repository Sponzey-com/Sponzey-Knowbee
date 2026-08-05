import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination } from "./yeonjang-browser-active-tab-info-release-evidence-chain-termination.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReviewInput = {
    readonly termination: YeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination;
    readonly cleanupCandidateRefs: readonly string[];
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.v1";
    readonly method: "browser.active_tab_info";
    readonly reviewStatus: "ready" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_architecture_review_ready" | "active_tab_info_release_evidence_chain_architecture_review_termination_not_closed" | "active_tab_info_release_evidence_chain_architecture_review_candidate_ref_invalid";
    readonly cleanupCandidateCount: number;
    readonly keepBoundaryRefs: readonly string[];
    readonly removeCandidateRefs: readonly string[];
    readonly manualDecisionRequired: true;
    readonly deleteCodeNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReviewInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.d.ts.map