import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal } from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGateInput = {
    readonly cleanupProposal: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal;
    readonly operatorApprovalRef?: string;
    readonly approvedCandidateRefs?: readonly string[];
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-approval-gate.v1";
    readonly method: "browser.active_tab_info";
    readonly approvalStatus: "ready_for_tidy_first_cleanup" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_approval_ready_for_tidy_first_cleanup" | "active_tab_info_release_evidence_chain_cleanup_approval_proposal_not_ready" | "active_tab_info_release_evidence_chain_cleanup_approval_ref_missing" | "active_tab_info_release_evidence_chain_cleanup_approval_ref_invalid" | "active_tab_info_release_evidence_chain_cleanup_approval_candidates_incomplete";
    readonly operatorApprovalRef?: string;
    readonly approvedCandidateCount: number;
    readonly nextAllowedAction: "create_tidy_first_cleanup_task" | "obtain_manual_approval" | "complete_cleanup_proposal";
    readonly deleteCodeNow: false;
    readonly modifyPackageNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGateInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-approval-gate.d.ts.map