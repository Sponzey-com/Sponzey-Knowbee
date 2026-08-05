const REQUIRED_BOUNDARIES = [
    "release_approval_evidence",
    "final_result",
    "product_log",
    "prepared_candidate",
    "operator_output",
];
function hasRequiredCoverage(coveredBoundaries) {
    const covered = new Set(coveredBoundaries);
    return REQUIRED_BOUNDARIES.every((boundary) => covered.has(boundary));
}
function blocked(reasonCode, summaryReady, misuseGuardCoverageStatus, nextAllowedAction) {
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.v1",
        method: "browser.active_tab_info",
        indexStatus: "blocked",
        reasonCode,
        summaryReady,
        misuseGuardCoverageStatus,
        nextAllowedAction,
        deleteCodeNow: false,
        modifyPackageNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex(input) {
    const summaryReady = input.cleanupTaskPlanSummary.summaryStatus === "ready";
    if (!summaryReady) {
        return blocked("active_tab_info_release_evidence_chain_cleanup_readiness_index_summary_not_ready", false, input.misuseGuardCoverage.coverageStatus, "complete_cleanup_task_plan_summary");
    }
    if (input.misuseGuardCoverage.coverageStatus !== "covered" ||
        !hasRequiredCoverage(input.misuseGuardCoverage.coveredBoundaries)) {
        return blocked("active_tab_info_release_evidence_chain_cleanup_readiness_index_guard_coverage_incomplete", true, "incomplete", "complete_cleanup_summary_misuse_guard");
    }
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.v1",
        method: "browser.active_tab_info",
        indexStatus: "ready",
        reasonCode: "active_tab_info_release_evidence_chain_cleanup_readiness_index_ready",
        summaryReady: true,
        misuseGuardCoverageStatus: "covered",
        nextAllowedAction: "prepare_separate_tidy_first_cleanup_pr",
        deleteCodeNow: false,
        modifyPackageNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.js.map