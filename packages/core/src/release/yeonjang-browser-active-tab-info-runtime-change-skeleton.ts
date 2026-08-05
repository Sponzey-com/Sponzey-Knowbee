import type {
  YeonjangBrowserActiveTabInfoActivationScope,
} from "./yeonjang-browser-active-tab-info-activation-request.js"
import type {
  YeonjangBrowserActiveTabInfoAuthorizationExecutorBridge,
} from "./yeonjang-browser-active-tab-info-authorization-executor-bridge.js"

export type YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonStep =
  | "confirm_runtime_change_authorization_scope"
  | "prepare_target_surface_change_plan"
  | "stage_rollback_commands"
  | "define_post_check_evidence_collection"
  | "stop_before_runtime_binding_mutation"

export type YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonBlockingReasonCode =
  | "runtime_change_skeleton_bridge_not_ready"
  | "runtime_change_skeleton_target_surfaces_required"
  | "runtime_change_skeleton_rollback_command_plan_required"
  | "runtime_change_skeleton_post_check_evidence_required"
  | "runtime_change_skeleton_failure_recovery_route_required"

export interface YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonInput {
  bridgeReadiness: YeonjangBrowserActiveTabInfoAuthorizationExecutorBridge
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  rollbackCommandPlan: readonly string[]
  postCheckEvidenceRequirements: readonly string[]
  failureRecoveryRoute?: "disable_target_surfaces_then_report_reason_code"
}

export type YeonjangBrowserActiveTabInfoRuntimeChangeSkeleton = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-change-skeleton.v1"
  method: "browser.active_tab_info"
  status: "runtime_change_skeleton_ready" | "blocked"
  reasonCode:
    | "active_tab_info_runtime_change_skeleton_ready"
    | "active_tab_info_runtime_change_skeleton_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonBlockingReasonCode[]
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  orderedSteps: readonly YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonStep[]
  rollbackCommandPlan: readonly string[]
  postCheckEvidenceRequirements: readonly string[]
  failureRecoveryRoute?: "disable_target_surfaces_then_report_reason_code"
  executeNow: false
  addRustDispatchNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const ORDERED_STEPS: readonly YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonStep[] = Object.freeze([
  "confirm_runtime_change_authorization_scope",
  "prepare_target_surface_change_plan",
  "stage_rollback_commands",
  "define_post_check_evidence_collection",
  "stop_before_runtime_binding_mutation",
])

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoRuntimeChangeSkeleton["status"]
  reasonCode: YeonjangBrowserActiveTabInfoRuntimeChangeSkeleton["reasonCode"]
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  rollbackCommandPlan: readonly string[]
  postCheckEvidenceRequirements: readonly string[]
  failureRecoveryRoute?: "disable_target_surfaces_then_report_reason_code"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonBlockingReasonCode[]
}): YeonjangBrowserActiveTabInfoRuntimeChangeSkeleton {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-change-skeleton.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    targetSurfaces: Object.freeze([...input.targetSurfaces]),
    orderedSteps: ORDERED_STEPS,
    rollbackCommandPlan: Object.freeze([...input.rollbackCommandPlan]),
    postCheckEvidenceRequirements: Object.freeze([...input.postCheckEvidenceRequirements]),
    ...(input.failureRecoveryRoute === undefined
      ? {}
      : { failureRecoveryRoute: input.failureRecoveryRoute }),
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoRuntimeChangeSkeleton(
  input: YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonInput,
): YeonjangBrowserActiveTabInfoRuntimeChangeSkeleton {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonBlockingReasonCode[] = []
  if (input.bridgeReadiness.status !== "ready_for_separate_runtime_change") {
    blockingReasonCodes.push("runtime_change_skeleton_bridge_not_ready")
  }
  if (input.targetSurfaces.length === 0) {
    blockingReasonCodes.push("runtime_change_skeleton_target_surfaces_required")
  }
  if (input.rollbackCommandPlan.length === 0) {
    blockingReasonCodes.push("runtime_change_skeleton_rollback_command_plan_required")
  }
  if (input.postCheckEvidenceRequirements.length === 0) {
    blockingReasonCodes.push("runtime_change_skeleton_post_check_evidence_required")
  }
  if (input.failureRecoveryRoute === undefined) {
    blockingReasonCodes.push("runtime_change_skeleton_failure_recovery_route_required")
  }

  if (blockingReasonCodes.length > 0) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_runtime_change_skeleton_blocked",
      targetSurfaces: input.targetSurfaces,
      rollbackCommandPlan: input.rollbackCommandPlan,
      postCheckEvidenceRequirements: input.postCheckEvidenceRequirements,
      ...(input.failureRecoveryRoute === undefined
        ? {}
        : { failureRecoveryRoute: input.failureRecoveryRoute }),
      blockingReasonCodes,
    })
  }

  return baseResult({
    status: "runtime_change_skeleton_ready",
    reasonCode: "active_tab_info_runtime_change_skeleton_ready",
    targetSurfaces: input.targetSurfaces,
    rollbackCommandPlan: input.rollbackCommandPlan,
    postCheckEvidenceRequirements: input.postCheckEvidenceRequirements,
    failureRecoveryRoute:
      input.failureRecoveryRoute as "disable_target_surfaces_then_report_reason_code",
  })
}
