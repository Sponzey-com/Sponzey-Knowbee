import type { YeonjangBrowserActiveTabInfoActivationScope } from "./yeonjang-browser-active-tab-info-activation-request.js";
import type { YeonjangBrowserActiveTabInfoRuntimeMutationPreflight } from "./yeonjang-browser-active-tab-info-runtime-mutation-preflight.js";
export type YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanStep = "reconfirm_mutation_surface_lock" | "apply_runtime_binding_change" | "collect_post_check_evidence" | "stop_before_default_live_smoke";
export type YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanBlockingReasonCode = "runtime_mutation_executor_preflight_not_ready" | "runtime_mutation_executor_operator_final_confirmation_missing" | "runtime_mutation_executor_rollback_dry_run_failed" | "runtime_mutation_executor_post_check_dry_run_failed" | "runtime_mutation_executor_surface_lock_missing";
export interface YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanInput {
    runtimeMutationPreflight: YeonjangBrowserActiveTabInfoRuntimeMutationPreflight;
    operatorFinalConfirmation: boolean;
    rollbackCommandDryRunResult: "passed" | "failed";
    postCheckCollectorDryRunResult: "passed" | "failed";
    mutationSurfaceLockAcquired: boolean;
    cancelRequested: boolean;
}
export type YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.v1";
    method: "browser.active_tab_info";
    state: "planned" | "blocked" | "cancelled";
    reasonCode: "active_tab_info_runtime_mutation_executor_plan_ready" | "active_tab_info_runtime_mutation_executor_plan_blocked" | "active_tab_info_runtime_mutation_executor_plan_cancelled";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanBlockingReasonCode[];
    mutationSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
    orderedExecutionSteps: readonly YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanStep[];
    rollbackDryRunSummary: "passed" | "failed";
    postCheckDryRunSummary: "passed" | "failed";
    executeNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan(input: YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlanInput): YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan;
//# sourceMappingURL=yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.d.ts.map