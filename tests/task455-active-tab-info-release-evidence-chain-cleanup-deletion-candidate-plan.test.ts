import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.ts"

const ACCEPTED_ADMISSION: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.v1",
  method: "browser.active_tab_info",
  admissionStatus: "accepted",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_accepted",
  reviewedPlanStatus: "ready",
  admissionDecision: "manual_cleanup_branch_execution_admitted",
  requiredExecutionBoundaries: [
    "Use a separate Tidy First cleanup branch only after operator admission.",
  ],
  nextAllowedAction: "prepare_cleanup_deletion_candidate_after_branch_admission",
  runGitNow: false,
  deleteCodeNow: false,
  modifyPackageNow: false,
  createBranchNow: false,
  releaseReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
}

const BLOCKED_ADMISSION: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission = {
  ...ACCEPTED_ADMISSION,
  admissionStatus: "blocked",
  reasonCode:
    "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_plan_not_ready",
  reviewedPlanStatus: "blocked",
  admissionDecision: "complete_cleanup_branch_preparation_plan",
  requiredExecutionBoundaries: [],
  nextAllowedAction: "complete_cleanup_branch_preparation_plan",
}

describe("task455 active tab info release evidence chain cleanup deletion candidate plan", () => {
  it("creates an audit-only deletion candidate plan from accepted admission and safe candidate refs", () => {
    const plan = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan({
      cleanupBranchExecutionAdmission: ACCEPTED_ADMISSION,
      deletionCandidateRefs: [
        "cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001",
        "cleanup-deletion-candidate:active-tab-info:sanitized:unused-receipt-002",
      ],
    })

    expect(plan).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.v1",
      method: "browser.active_tab_info",
      candidatePlanStatus: "ready",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_ready",
      reviewedAdmissionStatus: "accepted",
      candidateCount: 2,
      candidateRefs: [
        "cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001",
        "cleanup-deletion-candidate:active-tab-info:sanitized:unused-receipt-002",
      ],
      requiredDeletionReviewSteps: [
        "Review every sanitized cleanup deletion candidate before opening a separate Tidy First cleanup task.",
        "Confirm no candidate is required by release gate, package manifest, Skill mapping, production binding, or default live smoke evidence.",
        "Prepare a separate operator review receipt before any deletion execution is considered.",
      ],
      requiredVerificationCommands: [
        "pnpm exec vitest run ./tests/task454-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission-misuse-guard.test.ts ./tests/task453-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.test.ts",
        "pnpm --filter @knowbee/core build",
      ],
      nextAllowedAction: "review_cleanup_deletion_candidate_plan",
      runGitNow: false,
      deleteCodeNow: false,
      modifyPackageNow: false,
      createBranchNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks deletion candidate planning until execution admission is accepted", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan({
      cleanupBranchExecutionAdmission: BLOCKED_ADMISSION,
      deletionCandidateRefs: [
        "cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001",
      ],
    })).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.v1",
      method: "browser.active_tab_info",
      candidatePlanStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_admission_not_accepted",
      reviewedAdmissionStatus: "blocked",
      candidateCount: 0,
      candidateRefs: [],
      requiredDeletionReviewSteps: [],
      requiredVerificationCommands: [],
      nextAllowedAction: "complete_cleanup_branch_execution_admission",
      runGitNow: false,
      deleteCodeNow: false,
      modifyPackageNow: false,
      createBranchNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks an empty candidate list", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan({
      cleanupBranchExecutionAdmission: ACCEPTED_ADMISSION,
      deletionCandidateRefs: [],
    })).toMatchObject({
      candidatePlanStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_no_candidates",
      reviewedAdmissionStatus: "accepted",
      candidateCount: 0,
      candidateRefs: [],
      nextAllowedAction: "provide_cleanup_deletion_candidate_refs",
    })
  })

  it("blocks unsafe candidate refs without exposing them", () => {
    const plan = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan({
      cleanupBranchExecutionAdmission: ACCEPTED_ADMISSION,
      deletionCandidateRefs: ["/Users/operator/project?token=secret"],
    })

    expect(plan).toMatchObject({
      candidatePlanStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_candidate_ref_invalid",
      reviewedAdmissionStatus: "accepted",
      candidateCount: 0,
      candidateRefs: [],
      nextAllowedAction: "provide_cleanup_deletion_candidate_refs",
    })
    expect(JSON.stringify(plan)).not.toMatch(
      /\/Users\/|token=secret|https?:\/\/|cleanup-branch-execution-admission:|operator-accepted/iu,
    )
  })

  it("never exposes local paths, URLs, tokens, or execution flags", () => {
    const serialized = JSON.stringify(
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan({
        cleanupBranchExecutionAdmission: ACCEPTED_ADMISSION,
        deletionCandidateRefs: [
          "cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001",
        ],
      }),
    )

    expect(serialized).not.toMatch(
      /\/Users\/|\/private\/|https?:\/\/|token=|cleanup-branch-execution-admission:|runGitNow":true|deleteCodeNow":true|modifyPackageNow":true|createBranchNow":true|releaseReadinessNow":true|enableSkillMappingNow":true|addProductionBindingNow":true/iu,
    )
  })
})
