import type { YeonjangBrowserActiveTabInfoActivationScope } from "./yeonjang-browser-active-tab-info-activation-request.js";
import type { YeonjangBrowserActiveTabInfoRuntimeChangeSkeleton } from "./yeonjang-browser-active-tab-info-runtime-change-skeleton.js";
export type YeonjangBrowserActiveTabInfoRuntimeMutationPreflightBlockingReasonCode = "runtime_mutation_preflight_skeleton_not_ready" | "runtime_mutation_preflight_production_exposure_open" | "runtime_mutation_preflight_rollback_command_unavailable" | "runtime_mutation_preflight_post_check_collector_unavailable" | "runtime_mutation_preflight_final_product_log_boundary_missing";
export interface YeonjangBrowserActiveTabInfoRuntimeMutationPreflightInput {
    runtimeChangeSkeleton: YeonjangBrowserActiveTabInfoRuntimeChangeSkeleton;
    productionExposureClosed: boolean;
    rollbackCommandAvailable: boolean;
    postCheckCollectorAvailable: boolean;
    finalProductLogBoundaryReady: boolean;
}
export type YeonjangBrowserActiveTabInfoRuntimeMutationPreflight = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-preflight.v1";
    method: "browser.active_tab_info";
    status: "mutation_preflight_ready" | "blocked";
    reasonCode: "active_tab_info_runtime_mutation_preflight_ready" | "active_tab_info_runtime_mutation_preflight_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoRuntimeMutationPreflightBlockingReasonCode[];
    targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
    plannedMutationSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[];
    rollbackCommandPlan: readonly string[];
    postCheckEvidenceRequirements: readonly string[];
    executeNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoRuntimeMutationPreflight(input: YeonjangBrowserActiveTabInfoRuntimeMutationPreflightInput): YeonjangBrowserActiveTabInfoRuntimeMutationPreflight;
//# sourceMappingURL=yeonjang-browser-active-tab-info-runtime-mutation-preflight.d.ts.map