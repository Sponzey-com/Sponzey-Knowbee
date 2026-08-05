import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js";
import type { YeonjangBrowserFocusProductionExposureDecision } from "./yeonjang-browser-focus-production-exposure.js";
export type YeonjangBrowserFocusCommandSkeletonAggregatePlatform = "macos" | "windows" | "linux";
export interface YeonjangBrowserFocusCommandSkeletonAggregateSkeleton {
    status: "skeleton_ready" | "skeleton_blocked";
    reasonCode: string;
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    platform: YeonjangBrowserFocusCommandSkeletonAggregatePlatform;
    executeOsFocusNow: false;
    commandAccepted: false;
    requiresApproval: true;
    requiresFocusedTargetObservation: true;
    postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode;
    auditOnlyFields: readonly string[];
}
export interface YeonjangBrowserFocusCommandSkeletonAggregateInput {
    publicTargetName: string;
    platform: YeonjangBrowserFocusCommandSkeletonAggregatePlatform;
    skeleton: YeonjangBrowserFocusCommandSkeletonAggregateSkeleton;
    auditOnlyDetails?: Record<string, unknown> | undefined;
}
export interface YeonjangBrowserFocusCommandSkeletonPlatformProjection {
    publicTargetName: string;
    platform: YeonjangBrowserFocusCommandSkeletonAggregatePlatform;
    status: "ready" | "blocked";
    reasonCode: string;
    commandAccepted: false;
    executeOsFocusNow: false;
}
export type YeonjangBrowserFocusCommandSkeletonAggregateReasonCode = "browser_focus_command_skeleton_aggregate_ready" | "command_skeleton_required" | "production_exposure_not_executable" | "command_skeleton_blocked";
export type YeonjangBrowserFocusCommandSkeletonAggregate = {
    schemaVersion: "yeonjang-browser-focus-command-skeleton-aggregate-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    status: "aggregate_ready";
    reasonCode: "browser_focus_command_skeleton_aggregate_ready";
    executable: false;
    addProductionBindingNow: false;
    readyCount: number;
    blockedCount: 0;
    platforms: YeonjangBrowserFocusCommandSkeletonPlatformProjection[];
    productionExposure: YeonjangBrowserFocusCommandSkeletonProductionExposureProjection;
} | {
    schemaVersion: "yeonjang-browser-focus-command-skeleton-aggregate-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    status: "aggregate_blocked";
    reasonCode: Exclude<YeonjangBrowserFocusCommandSkeletonAggregateReasonCode, "browser_focus_command_skeleton_aggregate_ready">;
    executable: false;
    addProductionBindingNow: false;
    readyCount: number;
    blockedCount: number;
    platforms: YeonjangBrowserFocusCommandSkeletonPlatformProjection[];
    productionExposure: YeonjangBrowserFocusCommandSkeletonProductionExposureProjection;
};
export interface YeonjangBrowserFocusCommandSkeletonProductionExposureProjection {
    status: YeonjangBrowserFocusProductionExposureDecision["status"];
    reasonCode: YeonjangBrowserFocusProductionExposureDecision["reasonCode"];
    missingInventory: readonly string[];
}
export declare function aggregateYeonjangBrowserFocusCommandSkeletons(input: {
    skeletons: readonly YeonjangBrowserFocusCommandSkeletonAggregateInput[];
    productionExposure: YeonjangBrowserFocusProductionExposureDecision;
}): YeonjangBrowserFocusCommandSkeletonAggregate;
//# sourceMappingURL=yeonjang-browser-focus-command-skeleton-aggregate.d.ts.map