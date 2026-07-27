import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex,
} from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.ts"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklistInput = {
  readonly cleanupReadinessIndex: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist = {
  readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.v1"
  readonly method: "browser.active_tab_info"
  readonly checklistStatus: "ready" | "blocked"
  readonly reasonCode:
    | "active_tab_info_release_evidence_chain_cleanup_pr_checklist_ready"
    | "active_tab_info_release_evidence_chain_cleanup_pr_checklist_readiness_not_ready"
  readonly requiredReviewSteps: readonly string[]
  readonly requiredTestCommands: readonly string[]
  readonly rollbackNotes: readonly string[]
  readonly nextAllowedAction:
    | "open_cleanup_pr_after_manual_review"
    | "complete_cleanup_readiness_index"
  readonly deleteCodeNow: false
  readonly modifyPackageNow: false
  readonly releaseReadinessNow: false
  readonly enableSkillMappingNow: false
  readonly addProductionBindingNow: false
}

function blocked(): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.v1",
    method: "browser.active_tab_info",
    checklistStatus: "blocked",
    reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_checklist_readiness_not_ready",
    requiredReviewSteps: [],
    requiredTestCommands: [],
    rollbackNotes: [],
    nextAllowedAction: "complete_cleanup_readiness_index",
    deleteCodeNow: false,
    modifyPackageNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}

export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist(
  input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklistInput,
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist {
  if (input.cleanupReadinessIndex.indexStatus !== "ready") {
    return blocked()
  }

  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.v1",
    method: "browser.active_tab_info",
    checklistStatus: "ready",
    reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_checklist_ready",
    requiredReviewSteps: [
      "Confirm cleanup readiness index is ready and audit-only.",
      "Open a separate Tidy First cleanup PR without release activation changes.",
      "Review removed contracts against active release gate command coverage.",
    ],
    requiredTestCommands: [
      "pnpm exec vitest run ./tests/task446-active-tab-info-release-evidence-chain-cleanup-readiness-index-misuse-guard.test.ts ./tests/task445-active-tab-info-release-evidence-chain-cleanup-readiness-index.test.ts",
      "pnpm --filter @knowbee/core build",
    ],
    rollbackNotes: [
      "Revert only the separate cleanup PR if release gate coverage changes unexpectedly.",
      "Do not enable Skill mapping, production binding, or default live smoke during cleanup rollback.",
    ],
    nextAllowedAction: "open_cleanup_pr_after_manual_review",
    deleteCodeNow: false,
    modifyPackageNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}
