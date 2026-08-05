import type {
  YeonjangBrowserActiveTabInfoActivationScope,
} from "./yeonjang-browser-active-tab-info-activation-request.js"
import type {
  YeonjangBrowserActiveTabInfoActivationTaskTransitionResult,
} from "./yeonjang-browser-active-tab-info-activation-task-state-machine.js"

export type YeonjangBrowserActiveTabInfoActivationExecutorBlockingReasonCode =
  | "activation_executor_task_state_not_execution_planned"
  | "activation_executor_target_surfaces_required"
  | "activation_executor_rollback_command_plan_required"
  | "activation_executor_post_check_evidence_required"
  | "activation_executor_failure_recovery_route_required"

export type YeonjangBrowserActiveTabInfoActivationExecutorReasonCode =
  | "active_tab_info_activation_executor_high_risk_authorization_required"
  | "active_tab_info_activation_executor_ready_for_separate_runtime_change"
  | "active_tab_info_activation_executor_gate_missing"

export interface YeonjangBrowserActiveTabInfoActivationExecutorBoundaryInput {
  activationTaskState: YeonjangBrowserActiveTabInfoActivationTaskTransitionResult
  highRiskOperatorAuthorizationAccepted: boolean
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  rollbackCommandPlanAccepted: boolean
  postCheckEvidenceRequirementAccepted: boolean
  failureRecoveryRouteAccepted: boolean
}

export type YeonjangBrowserActiveTabInfoActivationExecutorBoundary = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-executor-boundary.v1"
  method: "browser.active_tab_info"
  status: "dry_run_plan" | "blocked"
  reasonCode: YeonjangBrowserActiveTabInfoActivationExecutorReasonCode
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoActivationExecutorBlockingReasonCode[]
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  rollbackCommandPlan: readonly string[]
  postCheckEvidenceRequirements: readonly string[]
  failureRecoveryRoute: "disable_target_surfaces_then_report_reason_code"
  executeNow: false
  addRustDispatchNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const POST_CHECK_EVIDENCE_REQUIREMENTS = Object.freeze([
  "active_tab_info_runtime_result_redacted",
  "active_tab_info_product_log_evidence_ref_only",
  "active_tab_info_release_surface_matrix_unchanged",
])

function buildRollbackCommandPlan(
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[],
): readonly string[] {
  return Object.freeze(
    targetSurfaces.map((surface) => `disable:browser.active_tab_info:${surface}`),
  )
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoActivationExecutorBoundary["status"]
  reasonCode: YeonjangBrowserActiveTabInfoActivationExecutorReasonCode
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoActivationExecutorBlockingReasonCode[]
}): YeonjangBrowserActiveTabInfoActivationExecutorBoundary {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-executor-boundary.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    targetSurfaces: Object.freeze([...input.targetSurfaces]),
    rollbackCommandPlan: buildRollbackCommandPlan(input.targetSurfaces),
    postCheckEvidenceRequirements: POST_CHECK_EVIDENCE_REQUIREMENTS,
    failureRecoveryRoute: "disable_target_surfaces_then_report_reason_code",
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoActivationExecutorBoundary(
  input: YeonjangBrowserActiveTabInfoActivationExecutorBoundaryInput,
): YeonjangBrowserActiveTabInfoActivationExecutorBoundary {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoActivationExecutorBlockingReasonCode[] = []
  if (input.activationTaskState.state !== "execution_planned") {
    blockingReasonCodes.push("activation_executor_task_state_not_execution_planned")
  }
  if (input.targetSurfaces.length === 0) {
    blockingReasonCodes.push("activation_executor_target_surfaces_required")
  }
  if (!input.rollbackCommandPlanAccepted) {
    blockingReasonCodes.push("activation_executor_rollback_command_plan_required")
  }
  if (!input.postCheckEvidenceRequirementAccepted) {
    blockingReasonCodes.push("activation_executor_post_check_evidence_required")
  }
  if (!input.failureRecoveryRouteAccepted) {
    blockingReasonCodes.push("activation_executor_failure_recovery_route_required")
  }

  if (blockingReasonCodes.length > 0) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_activation_executor_gate_missing",
      targetSurfaces: input.targetSurfaces,
      blockingReasonCodes,
    })
  }

  return baseResult({
    status: "dry_run_plan",
    reasonCode: input.highRiskOperatorAuthorizationAccepted
      ? "active_tab_info_activation_executor_ready_for_separate_runtime_change"
      : "active_tab_info_activation_executor_high_risk_authorization_required",
    targetSurfaces: input.targetSurfaces,
  })
}
