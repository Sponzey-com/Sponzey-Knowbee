const OPERATOR_APPROVAL_REF = /^cleanup-approval:active-tab-info:operator-approved:[a-z0-9][a-z0-9:-]{0,96}$/u;
function blocked(reasonCode, nextAllowedAction) {
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-approval-gate.v1",
        method: "browser.active_tab_info",
        approvalStatus: "blocked",
        reasonCode,
        approvedCandidateCount: 0,
        nextAllowedAction,
        deleteCodeNow: false,
        modifyPackageNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
export function evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate(input) {
    if (input.cleanupProposal.proposalStatus !== "ready") {
        return blocked("active_tab_info_release_evidence_chain_cleanup_approval_proposal_not_ready", "complete_cleanup_proposal");
    }
    const operatorApprovalRef = input.operatorApprovalRef?.trim();
    if (!operatorApprovalRef) {
        return blocked("active_tab_info_release_evidence_chain_cleanup_approval_ref_missing", "obtain_manual_approval");
    }
    if (!OPERATOR_APPROVAL_REF.test(operatorApprovalRef)) {
        return blocked("active_tab_info_release_evidence_chain_cleanup_approval_ref_invalid", "obtain_manual_approval");
    }
    const approvedCandidateRefs = new Set((input.approvedCandidateRefs ?? []).map((item) => item.trim()));
    const proposedCandidateRefs = input.cleanupProposal.proposalItems.map((item) => item.cleanupCandidateRef);
    if (proposedCandidateRefs.some((item) => !approvedCandidateRefs.has(item))) {
        return blocked("active_tab_info_release_evidence_chain_cleanup_approval_candidates_incomplete", "obtain_manual_approval");
    }
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-approval-gate.v1",
        method: "browser.active_tab_info",
        approvalStatus: "ready_for_tidy_first_cleanup",
        reasonCode: "active_tab_info_release_evidence_chain_cleanup_approval_ready_for_tidy_first_cleanup",
        operatorApprovalRef,
        approvedCandidateCount: proposedCandidateRefs.length,
        nextAllowedAction: "create_tidy_first_cleanup_task",
        deleteCodeNow: false,
        modifyPackageNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-approval-gate.js.map