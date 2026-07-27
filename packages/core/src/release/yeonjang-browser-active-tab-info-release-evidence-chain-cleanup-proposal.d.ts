import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview } from "./yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalReasonCode = "receipt_ledger_chain_too_deep" | "release_surface_boundary_duplicate" | "manual_architecture_review_required";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalItem = {
    readonly cleanupCandidateRef: string;
    readonly reasonCode: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalReasonCode;
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalInput = {
    readonly architectureReview: YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview;
    readonly proposalReasonByCandidateRef: Readonly<Record<string, YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalReasonCode>>;
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.v1";
    readonly method: "browser.active_tab_info";
    readonly proposalStatus: "ready" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_proposal_ready" | "active_tab_info_release_evidence_chain_cleanup_proposal_review_not_ready" | "active_tab_info_release_evidence_chain_cleanup_proposal_reason_missing";
    readonly proposalItems: readonly YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalItem[];
    readonly manualApprovalRequired: true;
    readonly deleteCodeNow: false;
    readonly modifyPackageNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.d.ts.map