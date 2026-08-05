import type { YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex } from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.ts";
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklistInput = {
    readonly cleanupReadinessIndex: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex;
};
export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist = {
    readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.v1";
    readonly method: "browser.active_tab_info";
    readonly checklistStatus: "ready" | "blocked";
    readonly reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_checklist_ready" | "active_tab_info_release_evidence_chain_cleanup_pr_checklist_readiness_not_ready";
    readonly requiredReviewSteps: readonly string[];
    readonly requiredTestCommands: readonly string[];
    readonly rollbackNotes: readonly string[];
    readonly nextAllowedAction: "open_cleanup_pr_after_manual_review" | "complete_cleanup_readiness_index";
    readonly deleteCodeNow: false;
    readonly modifyPackageNow: false;
    readonly releaseReadinessNow: false;
    readonly enableSkillMappingNow: false;
    readonly addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist(input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklistInput): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.d.ts.map