import { validateYeonjangBrowserActiveTabInfoLiveEnableReviewRecord, } from "./yeonjang-browser-active-tab-info-live-enable-review.js";
function openSurfaceCount(state) {
    return [
        state.rustLiveHandlerEnabled,
        state.skillMappingEnabled,
        state.productionBindingEnabled,
        state.defaultLiveSmokeEnabled,
    ].filter(Boolean).length;
}
function accepted(state, reasonCode, approvedSurfaces, openCount) {
    return {
        ok: true,
        state,
        reasonCode,
        approvedSurfaces: [...approvedSurfaces],
        openSurfaceCount: openCount,
    };
}
function rejected(state, reasonCode, approvedSurfaces, openCount, reviewReasonCode) {
    return {
        ok: false,
        state,
        reasonCode,
        approvedSurfaces: [...approvedSurfaces],
        openSurfaceCount: openCount,
        ...(reviewReasonCode ? { reviewReasonCode } : {}),
    };
}
export function transitionYeonjangBrowserActiveTabInfoLiveEnableState(input) {
    const openCount = openSurfaceCount(input.liveIntegrationState);
    if (input.event === "DISABLE") {
        return accepted("disabled", "active_tab_info_live_enable_disabled", [], openCount);
    }
    if (input.event === "ROLLBACK_TRIGGERED") {
        return rejected("rollback_required", "active_tab_info_live_enable_rollback_required", [], openCount);
    }
    if (openCount > 0 && input.currentState !== "staged_for_runtime_binding") {
        return rejected("rollback_required", "active_tab_info_live_enable_production_exposure_open_before_stage", [], openCount);
    }
    if (!input.evidenceReady) {
        return rejected("inventory_only", "active_tab_info_live_enable_missing_evidence", [], openCount);
    }
    if (input.event === "EVIDENCE_READY" && input.currentState === "inventory_only") {
        return accepted("review_ready", "active_tab_info_live_enable_review_ready", [], openCount);
    }
    const review = validateYeonjangBrowserActiveTabInfoLiveEnableReviewRecord(input.reviewRecord, input.now === undefined ? {} : { now: input.now });
    if (!review.ok) {
        return rejected("review_ready", "active_tab_info_live_enable_review_rejected", review.approvedSurfaces, openCount, review.reasonCode);
    }
    if (input.event === "REVIEW_ACCEPTED" && input.currentState === "review_ready") {
        return accepted("review_record_accepted", "active_tab_info_live_enable_review_record_accepted", review.approvedSurfaces, openCount);
    }
    if (input.event === "STAGE_BINDING" && input.currentState === "review_record_accepted") {
        return accepted("staged_for_runtime_binding", "active_tab_info_live_enable_staged", review.approvedSurfaces, openCount);
    }
    if (input.event === "ENABLE_BINDING" && input.currentState === "staged_for_runtime_binding") {
        return openCount > 0
            ? accepted("production_binding_enabled", "active_tab_info_live_enable_production_binding_detected", review.approvedSurfaces, openCount)
            : rejected("staged_for_runtime_binding", "active_tab_info_live_enable_transition_invalid", review.approvedSurfaces, openCount);
    }
    return rejected(input.currentState, "active_tab_info_live_enable_transition_invalid", review.approvedSurfaces, openCount);
}
export function buildYeonjangBrowserActiveTabInfoLiveEnableProjection(input) {
    const transition = transitionYeonjangBrowserActiveTabInfoLiveEnableState(input);
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-transition.v1",
        method: "browser.active_tab_info",
        visibility: "release_summary",
        state: transition.state,
        reasonCode: transition.reasonCode,
        transitionOk: transition.ok,
        approvedSurfaceCount: transition.approvedSurfaces.length,
        openSurfaceCount: transition.openSurfaceCount,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-live-enable-state-machine.js.map