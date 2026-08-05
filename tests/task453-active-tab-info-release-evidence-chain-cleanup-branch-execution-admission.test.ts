import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.ts"

const READY_PLAN: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.v1",
  method: "browser.active_tab_info",
  planStatus: "ready",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_ready",
  reviewedReceiptStatus: "accepted",
  requiredBranchSteps: [
    "Create a separate Tidy First cleanup branch after confirming the accepted cleanup PR review receipt.",
  ],
  requiredVerificationCommands: ["pnpm --filter @knowbee/core build"],
  rollbackNotes: ["Revert only the separate cleanup branch if release gate evidence changes unexpectedly."],
  nextAllowedAction: "create_separate_cleanup_branch_manually",
  deleteCodeNow: false,
  modifyPackageNow: false,
  createBranchNow: false,
  releaseReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
}

const BLOCKED_PLAN: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan = {
  ...READY_PLAN,
  planStatus: "blocked",
  reasonCode:
    "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_receipt_not_accepted",
  reviewedReceiptStatus: "blocked",
  requiredBranchSteps: [],
  requiredVerificationCommands: [],
  rollbackNotes: [],
  nextAllowedAction: "complete_cleanup_pr_review_receipt",
}

describe("task453 active tab info release evidence chain cleanup branch execution admission", () => {
  it("accepts only a ready branch preparation plan with a safe operator admission ref", () => {
    const admission =
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission({
        cleanupBranchPreparationPlan: READY_PLAN,
        operatorExecutionAdmissionRef:
          "cleanup-branch-execution-admission:active-tab-info:operator-accepted:manual-001",
      })

    expect(admission).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.v1",
      method: "browser.active_tab_info",
      admissionStatus: "accepted",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_accepted",
      reviewedPlanStatus: "ready",
      admissionDecision: "manual_cleanup_branch_execution_admitted",
      requiredExecutionBoundaries: [
        "Use a separate Tidy First cleanup branch only after operator admission.",
        "Do not delete reviewed candidates, mutate release packages, or enable production binding in this admission step.",
        "Record any later cleanup execution in a separate auditable task with its own verification receipt.",
      ],
      nextAllowedAction: "prepare_cleanup_deletion_candidate_after_branch_admission",
      runGitNow: false,
      deleteCodeNow: false,
      modifyPackageNow: false,
      createBranchNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks admission until the branch preparation plan is ready", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission({
      cleanupBranchPreparationPlan: BLOCKED_PLAN,
      operatorExecutionAdmissionRef:
        "cleanup-branch-execution-admission:active-tab-info:operator-accepted:manual-001",
    })).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.v1",
      method: "browser.active_tab_info",
      admissionStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_plan_not_ready",
      reviewedPlanStatus: "blocked",
      admissionDecision: "complete_cleanup_branch_preparation_plan",
      requiredExecutionBoundaries: [],
      nextAllowedAction: "complete_cleanup_branch_preparation_plan",
      runGitNow: false,
      deleteCodeNow: false,
      modifyPackageNow: false,
      createBranchNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks unsafe operator admission refs without exposing them", () => {
    const admission =
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission({
        cleanupBranchPreparationPlan: READY_PLAN,
        operatorExecutionAdmissionRef: "/Users/operator/project?token=secret",
      })

    expect(admission).toMatchObject({
      admissionStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_ref_invalid",
      reviewedPlanStatus: "ready",
      admissionDecision: "provide_safe_cleanup_branch_execution_admission_ref",
      nextAllowedAction: "provide_safe_cleanup_branch_execution_admission_ref",
    })
    expect(JSON.stringify(admission)).not.toMatch(
      /\/Users\/|token=secret|https?:\/\/|cleanup-branch-preparation:|cleanup-pr-review:|manual-001/iu,
    )
  })

  it("never exposes raw refs, local paths, URLs, tokens, or execution flags", () => {
    const serialized = JSON.stringify(
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission({
        cleanupBranchPreparationPlan: READY_PLAN,
        operatorExecutionAdmissionRef:
          "cleanup-branch-execution-admission:active-tab-info:operator-accepted:manual-001",
      }),
    )

    expect(serialized).not.toMatch(
      /\/Users\/|\/private\/|https?:\/\/|token=|cleanup-branch-preparation:|cleanup-pr-review:|runGitNow":true|deleteCodeNow":true|modifyPackageNow":true|createBranchNow":true|releaseReadinessNow":true|enableSkillMappingNow":true|addProductionBindingNow":true/iu,
    )
  })
})
