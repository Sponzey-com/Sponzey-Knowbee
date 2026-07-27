import type {
  YeonjangBrowserActiveTabInfoActivationRequest,
} from "./yeonjang-browser-active-tab-info-activation-request.js"

export type YeonjangBrowserActiveTabInfoActivationTaskState =
  | "draft"
  | "request_validated"
  | "operator_confirmed"
  | "execution_planned"
  | "blocked"
  | "cancelled"

export type YeonjangBrowserActiveTabInfoActivationTaskBlockingReasonCode =
  | "activation_task_request_not_ready"
  | "activation_task_operator_confirmation_required"
  | "activation_task_rollback_plan_required"
  | "activation_task_surface_matrix_required"

export interface YeonjangBrowserActiveTabInfoActivationTaskTransitionInput {
  currentState: YeonjangBrowserActiveTabInfoActivationTaskState
  activationRequest: YeonjangBrowserActiveTabInfoActivationRequest
  operatorConfirmed: boolean
  rollbackPlanAccepted: boolean
  surfaceMatrixAccepted: boolean
  cancelRequested: boolean
}

export type YeonjangBrowserActiveTabInfoActivationTaskReasonCode =
  | "active_tab_info_activation_request_validated"
  | "active_tab_info_activation_operator_confirmed"
  | "active_tab_info_activation_execution_planned"
  | "active_tab_info_activation_gate_missing"
  | "active_tab_info_activation_cancelled"

export type YeonjangBrowserActiveTabInfoActivationTaskTransitionResult =
  Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-task-state.v1"
    method: "browser.active_tab_info"
    state: YeonjangBrowserActiveTabInfoActivationTaskState
    reasonCode: YeonjangBrowserActiveTabInfoActivationTaskReasonCode
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoActivationTaskBlockingReasonCode[]
    executeNow: false
    addRustDispatchNow: false
    enableSkillMappingNow: false
    addProductionBindingNow: false
    enableDefaultLiveSmokeNow: false
  }>

function baseResult(
  state: YeonjangBrowserActiveTabInfoActivationTaskState,
  reasonCode: YeonjangBrowserActiveTabInfoActivationTaskReasonCode,
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoActivationTaskBlockingReasonCode[],
): YeonjangBrowserActiveTabInfoActivationTaskTransitionResult {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-task-state.v1",
    method: "browser.active_tab_info",
    state,
    reasonCode,
    ...(blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...blockingReasonCodes]) }),
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function transitionYeonjangBrowserActiveTabInfoActivationTask(
  input: YeonjangBrowserActiveTabInfoActivationTaskTransitionInput,
): YeonjangBrowserActiveTabInfoActivationTaskTransitionResult {
  if (input.cancelRequested || input.currentState === "cancelled") {
    return baseResult("cancelled", "active_tab_info_activation_cancelled")
  }

  const blockingReasonCodes: YeonjangBrowserActiveTabInfoActivationTaskBlockingReasonCode[] = []
  if (input.activationRequest.status !== "activation_request_ready") {
    blockingReasonCodes.push("activation_task_request_not_ready")
  }
  if (!input.operatorConfirmed) {
    blockingReasonCodes.push("activation_task_operator_confirmation_required")
  }
  if (!input.rollbackPlanAccepted) {
    blockingReasonCodes.push("activation_task_rollback_plan_required")
  }
  if (!input.surfaceMatrixAccepted) {
    blockingReasonCodes.push("activation_task_surface_matrix_required")
  }

  if (blockingReasonCodes.length > 0) {
    return baseResult(
      "blocked",
      "active_tab_info_activation_gate_missing",
      blockingReasonCodes,
    )
  }

  if (input.currentState === "draft") {
    return baseResult("execution_planned", "active_tab_info_activation_execution_planned")
  }
  if (input.currentState === "request_validated") {
    return baseResult("operator_confirmed", "active_tab_info_activation_operator_confirmed")
  }
  if (input.currentState === "operator_confirmed") {
    return baseResult("execution_planned", "active_tab_info_activation_execution_planned")
  }

  return baseResult("request_validated", "active_tab_info_activation_request_validated")
}
