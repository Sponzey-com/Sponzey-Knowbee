import { type YeonjangBrowserActiveTabInfoLiveEnableReviewReasonCode, type YeonjangBrowserActiveTabInfoLiveEnableSurface } from "./yeonjang-browser-active-tab-info-live-enable-review.js";
export type YeonjangBrowserActiveTabInfoLiveEnableState = "inventory_only" | "review_ready" | "review_record_accepted" | "staged_for_runtime_binding" | "production_binding_enabled" | "rollback_required" | "disabled";
export type YeonjangBrowserActiveTabInfoLiveEnableEvent = "EVIDENCE_READY" | "REVIEW_ACCEPTED" | "STAGE_BINDING" | "ENABLE_BINDING" | "ROLLBACK_TRIGGERED" | "DISABLE";
export type YeonjangBrowserActiveTabInfoLiveEnableReasonCode = "active_tab_info_live_enable_inventory_only" | "active_tab_info_live_enable_review_ready" | "active_tab_info_live_enable_review_record_accepted" | "active_tab_info_live_enable_staged" | "active_tab_info_live_enable_production_binding_detected" | "active_tab_info_live_enable_disabled" | "active_tab_info_live_enable_missing_evidence" | "active_tab_info_live_enable_review_rejected" | "active_tab_info_live_enable_production_exposure_open_before_stage" | "active_tab_info_live_enable_rollback_required" | "active_tab_info_live_enable_transition_invalid";
export interface YeonjangBrowserActiveTabInfoLiveIntegrationState {
    rustLiveHandlerEnabled: boolean;
    skillMappingEnabled: boolean;
    productionBindingEnabled: boolean;
    defaultLiveSmokeEnabled: boolean;
}
export interface YeonjangBrowserActiveTabInfoLiveEnableTransitionInput {
    currentState: YeonjangBrowserActiveTabInfoLiveEnableState;
    event: YeonjangBrowserActiveTabInfoLiveEnableEvent;
    evidenceReady: boolean;
    reviewRecord?: unknown;
    liveIntegrationState: YeonjangBrowserActiveTabInfoLiveIntegrationState;
    now?: Date | number;
}
export type YeonjangBrowserActiveTabInfoLiveEnableTransitionResult = {
    ok: true;
    state: YeonjangBrowserActiveTabInfoLiveEnableState;
    reasonCode: Extract<YeonjangBrowserActiveTabInfoLiveEnableReasonCode, "active_tab_info_live_enable_review_ready" | "active_tab_info_live_enable_review_record_accepted" | "active_tab_info_live_enable_staged" | "active_tab_info_live_enable_production_binding_detected" | "active_tab_info_live_enable_disabled">;
    approvedSurfaces: readonly YeonjangBrowserActiveTabInfoLiveEnableSurface[];
    openSurfaceCount: number;
} | {
    ok: false;
    state: YeonjangBrowserActiveTabInfoLiveEnableState;
    reasonCode: Exclude<YeonjangBrowserActiveTabInfoLiveEnableReasonCode, "active_tab_info_live_enable_review_ready" | "active_tab_info_live_enable_review_record_accepted" | "active_tab_info_live_enable_staged" | "active_tab_info_live_enable_production_binding_detected" | "active_tab_info_live_enable_disabled">;
    approvedSurfaces: readonly YeonjangBrowserActiveTabInfoLiveEnableSurface[];
    openSurfaceCount: number;
    reviewReasonCode?: Exclude<YeonjangBrowserActiveTabInfoLiveEnableReviewReasonCode, "active_tab_info_live_enable_review_accepted">;
};
export interface YeonjangBrowserActiveTabInfoLiveEnableProjection {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-transition.v1";
    method: "browser.active_tab_info";
    visibility: "release_summary";
    state: YeonjangBrowserActiveTabInfoLiveEnableState;
    reasonCode: YeonjangBrowserActiveTabInfoLiveEnableReasonCode;
    transitionOk: boolean;
    approvedSurfaceCount: number;
    openSurfaceCount: number;
}
export declare function transitionYeonjangBrowserActiveTabInfoLiveEnableState(input: YeonjangBrowserActiveTabInfoLiveEnableTransitionInput): YeonjangBrowserActiveTabInfoLiveEnableTransitionResult;
export declare function buildYeonjangBrowserActiveTabInfoLiveEnableProjection(input: YeonjangBrowserActiveTabInfoLiveEnableTransitionInput): YeonjangBrowserActiveTabInfoLiveEnableProjection;
//# sourceMappingURL=yeonjang-browser-active-tab-info-live-enable-state-machine.d.ts.map