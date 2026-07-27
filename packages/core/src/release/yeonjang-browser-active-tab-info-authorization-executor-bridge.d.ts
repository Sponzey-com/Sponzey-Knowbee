import type { YeonjangBrowserActiveTabInfoActivationExecutorBoundary } from "./yeonjang-browser-active-tab-info-activation-executor-boundary.js";
import type { YeonjangBrowserActiveTabInfoActivationScope } from "./yeonjang-browser-active-tab-info-activation-request.js";
import type { YeonjangBrowserActiveTabInfoHighRiskAuthorization } from "./yeonjang-browser-active-tab-info-high-risk-authorization.js";
export interface YeonjangBrowserActiveTabInfoAuthorizationExecutorBridgeInput {
    authorization: YeonjangBrowserActiveTabInfoHighRiskAuthorization;
    executorBoundary: YeonjangBrowserActiveTabInfoActivationExecutorBoundary;
    now: Date;
}
export type YeonjangBrowserActiveTabInfoAuthorizationExecutorBridgeBlockingReasonCode = "authorization_executor_bridge_authorization_not_accepted" | "authorization_executor_bridge_executor_not_dry_run_plan" | "authorization_executor_bridge_authorization_expired" | "authorization_executor_bridge_target_surface_mismatch" | "authorization_executor_bridge_rollback_acknowledgement_missing" | "authorization_executor_bridge_post_check_acknowledgement_missing";
export type YeonjangBrowserActiveTabInfoAuthorizationExecutorBridge = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-authorization-executor-bridge.v1";
    method: "browser.active_tab_info";
    status: "ready_for_separate_runtime_change" | "blocked";
    reasonCode: "active_tab_info_authorization_executor_bridge_ready" | "active_tab_info_authorization_executor_bridge_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoAuthorizationExecutorBridgeBlockingReasonCode[];
    targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
    executeNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function bridgeYeonjangBrowserActiveTabInfoAuthorizationToExecutor(input: YeonjangBrowserActiveTabInfoAuthorizationExecutorBridgeInput): YeonjangBrowserActiveTabInfoAuthorizationExecutorBridge;
//# sourceMappingURL=yeonjang-browser-active-tab-info-authorization-executor-bridge.d.ts.map