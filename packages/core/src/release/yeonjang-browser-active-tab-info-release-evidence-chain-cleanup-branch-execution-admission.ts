import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan,
} from "./yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.ts"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmissionInput = {
  readonly cleanupBranchPreparationPlan: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan
  readonly operatorExecutionAdmissionRef?: string
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission = {
  readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.v1"
  readonly method: "browser.active_tab_info"
  readonly admissionStatus: "accepted" | "blocked"
  readonly reasonCode:
    | "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_accepted"
    | "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_plan_not_ready"
    | "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_ref_invalid"
  readonly reviewedPlanStatus: "ready" | "blocked"
  readonly admissionDecision:
    | "manual_cleanup_branch_execution_admitted"
    | "complete_cleanup_branch_preparation_plan"
    | "provide_safe_cleanup_branch_execution_admission_ref"
  readonly requiredExecutionBoundaries: readonly string[]
  readonly nextAllowedAction:
    | "prepare_cleanup_deletion_candidate_after_branch_admission"
    | "complete_cleanup_branch_preparation_plan"
    | "provide_safe_cleanup_branch_execution_admission_ref"
  readonly runGitNow: false
  readonly deleteCodeNow: false
  readonly modifyPackageNow: false
  readonly createBranchNow: false
  readonly releaseReadinessNow: false
  readonly enableSkillMappingNow: false
  readonly addProductionBindingNow: false
}

const SAFE_OPERATOR_EXECUTION_ADMISSION_REF =
  /^cleanup-branch-execution-admission:active-tab-info:operator-accepted:[a-z0-9][a-z0-9:-]{0,96}$/u

function blocked(input: {
  reasonCode: Exclude<
    YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission["reasonCode"],
    "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_accepted"
  >
  reviewedPlanStatus: "ready" | "blocked"
  admissionDecision: Extract<
    YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission["admissionDecision"],
    "complete_cleanup_branch_preparation_plan" | "provide_safe_cleanup_branch_execution_admission_ref"
  >
  nextAllowedAction: Extract<
    YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission["nextAllowedAction"],
    "complete_cleanup_branch_preparation_plan" | "provide_safe_cleanup_branch_execution_admission_ref"
  >
}): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission {
  return {
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.v1",
    method: "browser.active_tab_info",
    admissionStatus: "blocked",
    reasonCode: input.reasonCode,
    reviewedPlanStatus: input.reviewedPlanStatus,
    admissionDecision: input.admissionDecision,
    requiredExecutionBoundaries: [],
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

export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission(
  input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmissionInput,
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission {
  if (
    input.cleanupBranchPreparationPlan.planStatus !== "ready" ||
    input.cleanupBranchPreparationPlan.nextAllowedAction !== "create_separate_cleanup_branch_manually"
  ) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_plan_not_ready",
      reviewedPlanStatus: input.cleanupBranchPreparationPlan.planStatus,
      admissionDecision: "complete_cleanup_branch_preparation_plan",
      nextAllowedAction: "complete_cleanup_branch_preparation_plan",
    })
  }

  const operatorExecutionAdmissionRef = input.operatorExecutionAdmissionRef?.trim() ?? ""
  if (!SAFE_OPERATOR_EXECUTION_ADMISSION_REF.test(operatorExecutionAdmissionRef)) {
    return blocked({
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_ref_invalid",
      reviewedPlanStatus: "ready",
      admissionDecision: "provide_safe_cleanup_branch_execution_admission_ref",
      nextAllowedAction: "provide_safe_cleanup_branch_execution_admission_ref",
    })
  }

  return {
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.v1",
    method: "browser.active_tab_info",
    admissionStatus: "accepted",
    reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_accepted",
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
  }
}
