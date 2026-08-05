const PROPOSAL_REASON_CODES = new Set([
    "receipt_ledger_chain_too_deep",
    "release_surface_boundary_duplicate",
    "manual_architecture_review_required",
]);
function blocked(reasonCode) {
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.v1",
        method: "browser.active_tab_info",
        proposalStatus: "blocked",
        reasonCode,
        proposalItems: [],
        manualApprovalRequired: true,
        deleteCodeNow: false,
        modifyPackageNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal(input) {
    if (input.architectureReview.reviewStatus !== "ready") {
        return blocked("active_tab_info_release_evidence_chain_cleanup_proposal_review_not_ready");
    }
    const proposalItems = [];
    for (const cleanupCandidateRef of input.architectureReview.removeCandidateRefs) {
        const reasonCode = input.proposalReasonByCandidateRef[cleanupCandidateRef];
        if (!reasonCode || !PROPOSAL_REASON_CODES.has(reasonCode)) {
            return blocked("active_tab_info_release_evidence_chain_cleanup_proposal_reason_missing");
        }
        proposalItems.push({ cleanupCandidateRef, reasonCode });
    }
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.v1",
        method: "browser.active_tab_info",
        proposalStatus: "ready",
        reasonCode: "active_tab_info_release_evidence_chain_cleanup_proposal_ready",
        proposalItems,
        manualApprovalRequired: true,
        deleteCodeNow: false,
        modifyPackageNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.js.map