import type { YeonjangBrowserActiveTabInfoActivationScope } from "./yeonjang-browser-active-tab-info-activation-request.js";
import type { YeonjangBrowserActiveTabInfoAuthorizationExecutorBridge } from "./yeonjang-browser-active-tab-info-authorization-executor-bridge.js";
export type YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonStep = "confirm_runtime_change_authorization_scope" | "prepare_target_surface_change_plan" | "stage_rollback_commands" | "define_post_check_evidence_collection" | "stop_before_runtime_binding_mutation";
export type YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonBlockingReasonCode = "runtime_change_skeleton_bridge_not_ready" | "runtime_change_skeleton_target_surfaces_required" | "runtime_change_skeleton_rollback_command_plan_required" | "runtime_change_skeleton_post_check_evidence_required" | "runtime_change_skeleton_failure_recovery_route_required";
export interface YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonInput {
    bridgeReadiness: YeonjangBrowserActiveTabInfoAuthorizationExecutorBridge;
    targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
    rollbackCommandPlan: readonly string[];
    postCheckEvidenceRequirements: readonly string[];
    failureRecoveryRoute?: "disable_target_surfaces_then_report_reason_code";
}
export type YeonjangBrowserActiveTabInfoRuntimeChangeSkeleton = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-change-skeleton.v1";
    method: "browser.active_tab_info";
    status: "runtime_change_skeleton_ready" | "blocked";
    reasonCode: "active_tab_info_runtime_change_skeleton_ready" | "active_tab_info_runtime_change_skeleton_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonBlockingReasonCode[];
    targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
    orderedSteps: readonly YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonStep[];
    rollbackCommandPlan: readonly string[];
    postCheckEvidenceRequirements: readonly string[];
    failureRecoveryRoute?: "disable_target_surfaces_then_report_reason_code";
    executeNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoRuntimeChangeSkeleton(input: YeonjangBrowserActiveTabInfoRuntimeChangeSkeletonInput): YeonjangBrowserActiveTabInfoRuntimeChangeSkeleton;
//# sourceMappingURL=yeonjang-browser-active-tab-info-runtime-change-skeleton.d.ts.map