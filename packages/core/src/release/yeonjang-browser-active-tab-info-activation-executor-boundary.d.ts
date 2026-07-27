import type { YeonjangBrowserActiveTabInfoActivationScope } from "./yeonjang-browser-active-tab-info-activation-request.js";
import type { YeonjangBrowserActiveTabInfoActivationTaskTransitionResult } from "./yeonjang-browser-active-tab-info-activation-task-state-machine.js";
export type YeonjangBrowserActiveTabInfoActivationExecutorBlockingReasonCode = "activation_executor_task_state_not_execution_planned" | "activation_executor_target_surfaces_required" | "activation_executor_rollback_command_plan_required" | "activation_executor_post_check_evidence_required" | "activation_executor_failure_recovery_route_required";
export type YeonjangBrowserActiveTabInfoActivationExecutorReasonCode = "active_tab_info_activation_executor_high_risk_authorization_required" | "active_tab_info_activation_executor_ready_for_separate_runtime_change" | "active_tab_info_activation_executor_gate_missing";
export interface YeonjangBrowserActiveTabInfoActivationExecutorBoundaryInput {
    activationTaskState: YeonjangBrowserActiveTabInfoActivationTaskTransitionResult;
    highRiskOperatorAuthorizationAccepted: boolean;
    targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
    rollbackCommandPlanAccepted: boolean;
    postCheckEvidenceRequirementAccepted: boolean;
    failureRecoveryRouteAccepted: boolean;
}
export type YeonjangBrowserActiveTabInfoActivationExecutorBoundary = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-executor-boundary.v1";
    method: "browser.active_tab_info";
    status: "dry_run_plan" | "blocked";
    reasonCode: YeonjangBrowserActiveTabInfoActivationExecutorReasonCode;
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoActivationExecutorBlockingReasonCode[];
    targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
    rollbackCommandPlan: readonly string[];
    postCheckEvidenceRequirements: readonly string[];
    failureRecoveryRoute: "disable_target_surfaces_then_report_reason_code";
    executeNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoActivationExecutorBoundary(input: YeonjangBrowserActiveTabInfoActivationExecutorBoundaryInput): YeonjangBrowserActiveTabInfoActivationExecutorBoundary;
//# sourceMappingURL=yeonjang-browser-active-tab-info-activation-executor-boundary.d.ts.map