import type {
  YeonjangBrowserActiveTabInfoActivationScope,
} from "./yeonjang-browser-active-tab-info-activation-request.js"
import type {
  YeonjangBrowserActiveTabInfoLiveExecutionReceipt,
} from "./yeonjang-browser-active-tab-info-live-execution-receipt.js"

export type YeonjangBrowserActiveTabInfoDispatchExecutionPlanStep =
  | "reconfirm_live_execution_receipt"
  | "reconfirm_target_surface_lock"
  | "prepare_rust_dispatch_input"
  | "collect_dispatch_result_reference"
  | "stop_before_skill_mapping_activation"

export type YeonjangBrowserActiveTabInfoDispatchExecutionPlanRollbackStep =
  | "use_receipt_rollback_command_ref"
  | "restore_previous_runtime_binding"
  | "record_rollback_reference_only"

export type YeonjangBrowserActiveTabInfoDispatchExecutionPlanPostCheckStep =
  | "use_receipt_post_execution_verification_plan_ref"
  | "verify_redacted_runtime_result"
  | "verify_final_and_product_log_boundaries"

export type YeonjangBrowserActiveTabInfoDispatchExecutionPlanBlockingReasonCode =
  | "dispatch_execution_plan_receipt_not_ready"
  | "dispatch_execution_plan_transport_not_ready"
  | "dispatch_execution_plan_surface_lock_missing"
  | "dispatch_execution_plan_rollback_executor_unavailable"
  | "dispatch_execution_plan_post_check_executor_unavailable"

export interface YeonjangBrowserActiveTabInfoDispatchExecutionPlanInput {
  liveExecutionReceipt: YeonjangBrowserActiveTabInfoLiveExecutionReceipt
  dispatchTransportReady: boolean
  targetSurfaceLockAcquired: boolean
  rollbackExecutorAvailable: boolean
  postCheckExecutorAvailable: boolean
  cancelRequested: boolean
}

export type YeonjangBrowserActiveTabInfoDispatchExecutionPlan = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-plan.v1"
  method: "browser.active_tab_info"
  state: "planned" | "blocked" | "cancelled"
  reasonCode:
    | "active_tab_info_dispatch_execution_plan_ready"
    | "active_tab_info_dispatch_execution_plan_blocked"
    | "active_tab_info_dispatch_execution_plan_cancelled"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanBlockingReasonCode[]
  liveExecutionReceiptId: string
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  orderedDispatchSteps: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanStep[]
  rollbackSteps: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanRollbackStep[]
  postCheckSteps: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanPostCheckStep[]
  dispatchNow: false
  addRustDispatchNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
  markUserGoalSucceededNow: false
}>

const ORDERED_DISPATCH_STEPS: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanStep[] =
  Object.freeze([
    "reconfirm_live_execution_receipt",
    "reconfirm_target_surface_lock",
    "prepare_rust_dispatch_input",
    "collect_dispatch_result_reference",
    "stop_before_skill_mapping_activation",
  ])

const ROLLBACK_STEPS: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanRollbackStep[] =
  Object.freeze([
    "use_receipt_rollback_command_ref",
    "restore_previous_runtime_binding",
    "record_rollback_reference_only",
  ])

const POST_CHECK_STEPS: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanPostCheckStep[] =
  Object.freeze([
    "use_receipt_post_execution_verification_plan_ref",
    "verify_redacted_runtime_result",
    "verify_final_and_product_log_boundaries",
  ])

function receiptId(input: YeonjangBrowserActiveTabInfoLiveExecutionReceipt): string {
  return input.receipt?.liveExecutionReceiptId ?? "live-execution-receipt:browser.active_tab_info:blocked"
}

function targetSurfaces(
  input: YeonjangBrowserActiveTabInfoLiveExecutionReceipt,
): readonly YeonjangBrowserActiveTabInfoActivationScope[] {
  return input.receipt?.targetSurfaces ?? []
}

function baseResult(input: {
  state: YeonjangBrowserActiveTabInfoDispatchExecutionPlan["state"]
  reasonCode: YeonjangBrowserActiveTabInfoDispatchExecutionPlan["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoDispatchExecutionPlanBlockingReasonCode[]
  liveExecutionReceiptId: string
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
}): YeonjangBrowserActiveTabInfoDispatchExecutionPlan {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-plan.v1",
    method: "browser.active_tab_info",
    state: input.state,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    liveExecutionReceiptId: input.liveExecutionReceiptId,
    targetSurfaces: Object.freeze([...input.targetSurfaces]),
    orderedDispatchSteps: ORDERED_DISPATCH_STEPS,
    rollbackSteps: ROLLBACK_STEPS,
    postCheckSteps: POST_CHECK_STEPS,
    dispatchNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    markUserGoalSucceededNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoDispatchExecutionPlan(
  input: YeonjangBrowserActiveTabInfoDispatchExecutionPlanInput,
): YeonjangBrowserActiveTabInfoDispatchExecutionPlan {
  const liveExecutionReceiptId = receiptId(input.liveExecutionReceipt)
  const surfaces = targetSurfaces(input.liveExecutionReceipt)
  if (input.cancelRequested) {
    return baseResult({
      state: "cancelled",
      reasonCode: "active_tab_info_dispatch_execution_plan_cancelled",
      liveExecutionReceiptId,
      targetSurfaces: surfaces,
    })
  }

  const blockingReasonCodes: YeonjangBrowserActiveTabInfoDispatchExecutionPlanBlockingReasonCode[] = []
  if (input.liveExecutionReceipt.status !== "live_execution_receipt_ready") {
    blockingReasonCodes.push("dispatch_execution_plan_receipt_not_ready")
  }
  if (!input.dispatchTransportReady) {
    blockingReasonCodes.push("dispatch_execution_plan_transport_not_ready")
  }
  if (!input.targetSurfaceLockAcquired) {
    blockingReasonCodes.push("dispatch_execution_plan_surface_lock_missing")
  }
  if (!input.rollbackExecutorAvailable) {
    blockingReasonCodes.push("dispatch_execution_plan_rollback_executor_unavailable")
  }
  if (!input.postCheckExecutorAvailable) {
    blockingReasonCodes.push("dispatch_execution_plan_post_check_executor_unavailable")
  }

  if (blockingReasonCodes.length > 0) {
    return baseResult({
      state: "blocked",
      reasonCode: "active_tab_info_dispatch_execution_plan_blocked",
      blockingReasonCodes,
      liveExecutionReceiptId,
      targetSurfaces: surfaces,
    })
  }

  return baseResult({
    state: "planned",
    reasonCode: "active_tab_info_dispatch_execution_plan_ready",
    liveExecutionReceiptId,
    targetSurfaces: surfaces,
  })
}
