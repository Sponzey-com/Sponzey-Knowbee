import type {
  YeonjangBrowserActiveTabInfoActivationScope,
} from "./yeonjang-browser-active-tab-info-activation-request.js"
import type {
  YeonjangBrowserActiveTabInfoRuntimeMutationPreflight,
} from "./yeonjang-browser-active-tab-info-runtime-mutation-preflight.js"

export type YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanStep =
  | "reconfirm_mutation_surface_lock"
  | "apply_runtime_binding_change"
  | "collect_post_check_evidence"
  | "stop_before_default_live_smoke"

export type YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanBlockingReasonCode =
  | "runtime_mutation_executor_preflight_not_ready"
  | "runtime_mutation_executor_operator_final_confirmation_missing"
  | "runtime_mutation_executor_rollback_dry_run_failed"
  | "runtime_mutation_executor_post_check_dry_run_failed"
  | "runtime_mutation_executor_surface_lock_missing"

export interface YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanInput {
  runtimeMutationPreflight: YeonjangBrowserActiveTabInfoRuntimeMutationPreflight
  operatorFinalConfirmation: boolean
  rollbackCommandDryRunResult: "passed" | "failed"
  postCheckCollectorDryRunResult: "passed" | "failed"
  mutationSurfaceLockAcquired: boolean
  cancelRequested: boolean
}

export type YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.v1"
  method: "browser.active_tab_info"
  state: "planned" | "blocked" | "cancelled"
  reasonCode:
    | "active_tab_info_runtime_mutation_executor_plan_ready"
    | "active_tab_info_runtime_mutation_executor_plan_blocked"
    | "active_tab_info_runtime_mutation_executor_plan_cancelled"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanBlockingReasonCode[]
  mutationSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  orderedExecutionSteps: readonly YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanStep[]
  rollbackDryRunSummary: "passed" | "failed"
  postCheckDryRunSummary: "passed" | "failed"
  executeNow: false
  addRustDispatchNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const ORDERED_EXECUTION_STEPS: readonly YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanStep[] =
  Object.freeze([
    "reconfirm_mutation_surface_lock",
    "apply_runtime_binding_change",
    "collect_post_check_evidence",
    "stop_before_default_live_smoke",
  ])

function baseResult(input: {
  state: YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan["state"]
  reasonCode: YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanBlockingReasonCode[]
  mutationSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  rollbackDryRunSummary: "passed" | "failed"
  postCheckDryRunSummary: "passed" | "failed"
}): YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.v1",
    method: "browser.active_tab_info",
    state: input.state,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    mutationSurfaces: Object.freeze([...input.mutationSurfaces]),
    orderedExecutionSteps: ORDERED_EXECUTION_STEPS,
    rollbackDryRunSummary: input.rollbackDryRunSummary,
    postCheckDryRunSummary: input.postCheckDryRunSummary,
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan(
  input: YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanInput,
): YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan {
  if (input.cancelRequested) {
    return baseResult({
      state: "cancelled",
      reasonCode: "active_tab_info_runtime_mutation_executor_plan_cancelled",
      mutationSurfaces: input.runtimeMutationPreflight.plannedMutationSurfaces,
      rollbackDryRunSummary: input.rollbackCommandDryRunResult,
      postCheckDryRunSummary: input.postCheckCollectorDryRunResult,
    })
  }

  const blockingReasonCodes: YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanBlockingReasonCode[] = []
  if (input.runtimeMutationPreflight.status !== "mutation_preflight_ready") {
    blockingReasonCodes.push("runtime_mutation_executor_preflight_not_ready")
  }
  if (!input.operatorFinalConfirmation) {
    blockingReasonCodes.push("runtime_mutation_executor_operator_final_confirmation_missing")
  }
  if (input.rollbackCommandDryRunResult !== "passed") {
    blockingReasonCodes.push("runtime_mutation_executor_rollback_dry_run_failed")
  }
  if (input.postCheckCollectorDryRunResult !== "passed") {
    blockingReasonCodes.push("runtime_mutation_executor_post_check_dry_run_failed")
  }
  if (!input.mutationSurfaceLockAcquired) {
    blockingReasonCodes.push("runtime_mutation_executor_surface_lock_missing")
  }

  if (blockingReasonCodes.length > 0) {
    return baseResult({
      state: "blocked",
      reasonCode: "active_tab_info_runtime_mutation_executor_plan_blocked",
      blockingReasonCodes,
      mutationSurfaces: input.runtimeMutationPreflight.plannedMutationSurfaces,
      rollbackDryRunSummary: input.rollbackCommandDryRunResult,
      postCheckDryRunSummary: input.postCheckCollectorDryRunResult,
    })
  }

  return baseResult({
    state: "planned",
    reasonCode: "active_tab_info_runtime_mutation_executor_plan_ready",
    mutationSurfaces: input.runtimeMutationPreflight.plannedMutationSurfaces,
    rollbackDryRunSummary: input.rollbackCommandDryRunResult,
    postCheckDryRunSummary: input.postCheckCollectorDryRunResult,
  })
}
