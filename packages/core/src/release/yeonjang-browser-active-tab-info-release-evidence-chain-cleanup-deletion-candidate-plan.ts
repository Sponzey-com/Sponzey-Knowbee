import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission,
} from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.ts"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlanInput = {
  readonly cleanupBranchExecutionAdmission: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission
  readonly deletionCandidateRefs?: readonly string[]
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan = {
  readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.v1"
  readonly method: "browser.active_tab_info"
  readonly candidatePlanStatus: "ready" | "blocked"
  readonly reasonCode:
    | "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_ready"
    | "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_admission_not_accepted"
    | "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_no_candidates"
    | "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_candidate_ref_invalid"
  readonly reviewedAdmissionStatus: "accepted" | "blocked"
  readonly candidateCount: number
  readonly candidateRefs: readonly string[]
  readonly requiredDeletionReviewSteps: readonly string[]
  readonly requiredVerificationCommands: readonly string[]
  readonly nextAllowedAction:
    | "review_cleanup_deletion_candidate_plan"
    | "complete_cleanup_branch_execution_admission"
    | "provide_cleanup_deletion_candidate_refs"
  readonly runGitNow: false
  readonly deleteCodeNow: false
  readonly modifyPackageNow: false
  readonly createBranchNow: false
  readonly releaseReadinessNow: false
  readonly enableSkillMappingNow: false
  readonly addProductionBindingNow: false
}

const SAFE_DELETION_CANDIDATE_REF =
  /^cleanup-deletion-candidate:active-tab-info:sanitized:[a-z0-9][a-z0-9:-]{0,96}$/u

function blocked(input: {
  reasonCode: Exclude<
    YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan["reasonCode"],
    "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_ready"
  >
  reviewedAdmissionStatus: "accepted" | "blocked"
  nextAllowedAction: Extract<
    YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan["nextAllowedAction"],
    "complete_cleanup_branch_execution_admission" | "provide_cleanup_deletion_candidate_refs"
  >
}): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan {
  return {
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.v1",
    method: "browser.active_tab_info",
    candidatePlanStatus: "blocked",
    reasonCode: input.reasonCode,
    reviewedAdmissionStatus: input.reviewedAdmissionStatus,
    candidateCount: 0,
    candidateRefs: [],
    requiredDeletionReviewSteps: [],
    requiredVerificationCommands: [],
    nextAllowedAction: input.nextAllowedAction,
    runGitNow: false,
    deleteCodeNow: false,
    modifyPackageNow: false,
    createBranchNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}

export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan(
  input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlanInput,
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan {
  if (
    input.cleanupBranchExecutionAdmission.admissionStatus !== "accepted" ||
    input.cleanupBranchExecutionAdmission.nextAllowedAction !==
      "prepare_cleanup_deletion_candidate_after_branch_admission"
  ) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_admission_not_accepted",
      reviewedAdmissionStatus: input.cleanupBranchExecutionAdmission.admissionStatus,
      nextAllowedAction: "complete_cleanup_branch_execution_admission",
    })
  }

  const candidateRefs = [...(input.deletionCandidateRefs ?? [])].map((ref) => ref.trim())
  if (candidateRefs.length === 0) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_no_candidates",
      reviewedAdmissionStatus: "accepted",
      nextAllowedAction: "provide_cleanup_deletion_candidate_refs",
    })
  }
  if (candidateRefs.some((ref) => !SAFE_DELETION_CANDIDATE_REF.test(ref))) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_candidate_ref_invalid",
      reviewedAdmissionStatus: "accepted",
      nextAllowedAction: "provide_cleanup_deletion_candidate_refs",
    })
  }

  return {
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.v1",
    method: "browser.active_tab_info",
    candidatePlanStatus: "ready",
    reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_ready",
    reviewedAdmissionStatus: "accepted",
    candidateCount: candidateRefs.length,
    candidateRefs: Object.freeze(candidateRefs),
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
  }
}
