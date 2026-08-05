const SAFE_CLEANUP_BRANCH_REF = /^cleanup-branch-preparation:active-tab-info:sanitized:[a-z0-9][a-z0-9:-]{0,96}$/u;
function blocked(input) {
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.v1",
        method: "browser.active_tab_info",
        planStatus: "blocked",
        reasonCode: input.reasonCode,
        reviewedReceiptStatus: input.reviewedReceiptStatus,
        requiredBranchSteps: [],
        requiredVerificationCommands: [],
        rollbackNotes: [],
        nextAllowedAction: input.nextAllowedAction,
        deleteCodeNow: false,
        modifyPackageNow: false,
        createBranchNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan(input) {
    if (input.cleanupPrReviewReceipt.receiptStatus !== "accepted" ||
        input.cleanupPrReviewReceipt.nextAllowedAction !== "prepare_cleanup_branch_after_review") {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_receipt_not_accepted",
            reviewedReceiptStatus: input.cleanupPrReviewReceipt.receiptStatus,
            nextAllowedAction: "complete_cleanup_pr_review_receipt",
        });
    }
    const sanitizedCleanupBranchRef = input.sanitizedCleanupBranchRef?.trim() ?? "";
    if (!SAFE_CLEANUP_BRANCH_REF.test(sanitizedCleanupBranchRef)) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_branch_ref_invalid",
            reviewedReceiptStatus: "accepted",
            nextAllowedAction: "provide_safe_cleanup_branch_ref",
        });
    }
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.v1",
        method: "browser.active_tab_info",
        planStatus: "ready",
        reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_ready",
        reviewedReceiptStatus: "accepted",
        requiredBranchSteps: [
            "Create a separate Tidy First cleanup branch after confirming the accepted cleanup PR review receipt.",
            "Remove only reviewed cleanup candidates in the separate cleanup branch.",
            "Keep release activation, Skill mapping, production binding, and default live smoke changes out of the cleanup branch.",
        ],
        requiredVerificationCommands: [
            "pnpm exec vitest run ./tests/task450-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt-misuse-guard.test.ts ./tests/task449-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.test.ts",
            "pnpm --filter @knowbee/core build",
        ],
        rollbackNotes: [
            "Revert only the separate cleanup branch if release gate evidence changes unexpectedly.",
            "Do not use cleanup rollback to enable release activation or runtime mutation.",
        ],
        nextAllowedAction: "create_separate_cleanup_branch_manually",
        deleteCodeNow: false,
        modifyPackageNow: false,
        createBranchNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.js.map