import {
  validateYeonjangBrowserActiveTabInfoLiveEnableReviewRecord,
  type YeonjangBrowserActiveTabInfoLiveEnableReviewReasonCode,
  type YeonjangBrowserActiveTabInfoLiveEnableSurface,
} from "./yeonjang-browser-active-tab-info-live-enable-review.js"

export type YeonjangBrowserActiveTabInfoLiveEnableState =
  | "inventory_only"
  | "review_ready"
  | "review_record_accepted"
  | "staged_for_runtime_binding"
  | "production_binding_enabled"
  | "rollback_required"
  | "disabled"

export type YeonjangBrowserActiveTabInfoLiveEnableEvent =
  | "EVIDENCE_READY"
  | "REVIEW_ACCEPTED"
  | "STAGE_BINDING"
  | "ENABLE_BINDING"
  | "ROLLBACK_TRIGGERED"
  | "DISABLE"

export type YeonjangBrowserActiveTabInfoLiveEnableReasonCode =
  | "active_tab_info_live_enable_inventory_only"
  | "active_tab_info_live_enable_review_ready"
  | "active_tab_info_live_enable_review_record_accepted"
  | "active_tab_info_live_enable_staged"
  | "active_tab_info_live_enable_production_binding_detected"
  | "active_tab_info_live_enable_disabled"
  | "active_tab_info_live_enable_missing_evidence"
  | "active_tab_info_live_enable_review_rejected"
  | "active_tab_info_live_enable_production_exposure_open_before_stage"
  | "active_tab_info_live_enable_rollback_required"
  | "active_tab_info_live_enable_transition_invalid"

export interface YeonjangBrowserActiveTabInfoLiveIntegrationState {
  rustLiveHandlerEnabled: boolean
  skillMappingEnabled: boolean
  productionBindingEnabled: boolean
  defaultLiveSmokeEnabled: boolean
}

export interface YeonjangBrowserActiveTabInfoLiveEnableTransitionInput {
  currentState: YeonjangBrowserActiveTabInfoLiveEnableState
  event: YeonjangBrowserActiveTabInfoLiveEnableEvent
  evidenceReady: boolean
  reviewRecord?: unknown
  liveIntegrationState: YeonjangBrowserActiveTabInfoLiveIntegrationState
  now?: Date | number
}

export type YeonjangBrowserActiveTabInfoLiveEnableTransitionResult =
  | {
      ok: true
      state: YeonjangBrowserActiveTabInfoLiveEnableState
      reasonCode: Extract<
        YeonjangBrowserActiveTabInfoLiveEnableReasonCode,
        | "active_tab_info_live_enable_review_ready"
        | "active_tab_info_live_enable_review_record_accepted"
        | "active_tab_info_live_enable_staged"
        | "active_tab_info_live_enable_production_binding_detected"
        | "active_tab_info_live_enable_disabled"
      >
      approvedSurfaces: readonly YeonjangBrowserActiveTabInfoLiveEnableSurface[]
      openSurfaceCount: number
    }
  | {
      ok: false
      state: YeonjangBrowserActiveTabInfoLiveEnableState
      reasonCode: Exclude<
        YeonjangBrowserActiveTabInfoLiveEnableReasonCode,
        | "active_tab_info_live_enable_review_ready"
        | "active_tab_info_live_enable_review_record_accepted"
        | "active_tab_info_live_enable_staged"
        | "active_tab_info_live_enable_production_binding_detected"
        | "active_tab_info_live_enable_disabled"
      >
      approvedSurfaces: readonly YeonjangBrowserActiveTabInfoLiveEnableSurface[]
      openSurfaceCount: number
      reviewReasonCode?: Exclude<
        YeonjangBrowserActiveTabInfoLiveEnableReviewReasonCode,
        "active_tab_info_live_enable_review_accepted"
      >
    }

export interface YeonjangBrowserActiveTabInfoLiveEnableProjection {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-transition.v1"
  method: "browser.active_tab_info"
  visibility: "release_summary"
  state: YeonjangBrowserActiveTabInfoLiveEnableState
  reasonCode: YeonjangBrowserActiveTabInfoLiveEnableReasonCode
  transitionOk: boolean
  approvedSurfaceCount: number
  openSurfaceCount: number
}

function openSurfaceCount(state: YeonjangBrowserActiveTabInfoLiveIntegrationState): number {
  return [
    state.rustLiveHandlerEnabled,
    state.skillMappingEnabled,
    state.productionBindingEnabled,
    state.defaultLiveSmokeEnabled,
  ].filter(Boolean).length
}

function accepted(
  state: YeonjangBrowserActiveTabInfoLiveEnableState,
  reasonCode: Extract<
    YeonjangBrowserActiveTabInfoLiveEnableReasonCode,
    | "active_tab_info_live_enable_review_ready"
    | "active_tab_info_live_enable_review_record_accepted"
    | "active_tab_info_live_enable_staged"
    | "active_tab_info_live_enable_production_binding_detected"
    | "active_tab_info_live_enable_disabled"
  >,
  approvedSurfaces: readonly YeonjangBrowserActiveTabInfoLiveEnableSurface[],
  openCount: number,
): YeonjangBrowserActiveTabInfoLiveEnableTransitionResult {
  return {
    ok: true,
    state,
    reasonCode,
    approvedSurfaces: [...approvedSurfaces],
    openSurfaceCount: openCount,
  }
}

function rejected(
  state: YeonjangBrowserActiveTabInfoLiveEnableState,
  reasonCode: Exclude<
    YeonjangBrowserActiveTabInfoLiveEnableReasonCode,
    | "active_tab_info_live_enable_review_ready"
    | "active_tab_info_live_enable_review_record_accepted"
    | "active_tab_info_live_enable_staged"
    | "active_tab_info_live_enable_production_binding_detected"
    | "active_tab_info_live_enable_disabled"
  >,
  approvedSurfaces: readonly YeonjangBrowserActiveTabInfoLiveEnableSurface[],
  openCount: number,
  reviewReasonCode?: Exclude<
    YeonjangBrowserActiveTabInfoLiveEnableReviewReasonCode,
    "active_tab_info_live_enable_review_accepted"
  >,
): YeonjangBrowserActiveTabInfoLiveEnableTransitionResult {
  return {
    ok: false,
    state,
    reasonCode,
    approvedSurfaces: [...approvedSurfaces],
    openSurfaceCount: openCount,
    ...(reviewReasonCode ? { reviewReasonCode } : {}),
  }
}

export function transitionYeonjangBrowserActiveTabInfoLiveEnableState(
  input: YeonjangBrowserActiveTabInfoLiveEnableTransitionInput,
): YeonjangBrowserActiveTabInfoLiveEnableTransitionResult {
  const openCount = openSurfaceCount(input.liveIntegrationState)
  if (input.event === "DISABLE") {
    return accepted("disabled", "active_tab_info_live_enable_disabled", [], openCount)
  }
  if (input.event === "ROLLBACK_TRIGGERED") {
    return rejected(
      "rollback_required",
      "active_tab_info_live_enable_rollback_required",
      [],
      openCount,
    )
  }
  if (openCount > 0 && input.currentState !== "staged_for_runtime_binding") {
    return rejected(
      "rollback_required",
      "active_tab_info_live_enable_production_exposure_open_before_stage",
      [],
      openCount,
    )
  }
  if (!input.evidenceReady) {
    return rejected(
      "inventory_only",
      "active_tab_info_live_enable_missing_evidence",
      [],
      openCount,
    )
  }
  if (input.event === "EVIDENCE_READY" && input.currentState === "inventory_only") {
    return accepted("review_ready", "active_tab_info_live_enable_review_ready", [], openCount)
  }

  const review = validateYeonjangBrowserActiveTabInfoLiveEnableReviewRecord(
    input.reviewRecord,
    input.now === undefined ? {} : { now: input.now },
  )
  if (!review.ok) {
    return rejected(
      "review_ready",
      "active_tab_info_live_enable_review_rejected",
      review.approvedSurfaces,
      openCount,
      review.reasonCode,
    )
  }
  if (input.event === "REVIEW_ACCEPTED" && input.currentState === "review_ready") {
    return accepted(
      "review_record_accepted",
      "active_tab_info_live_enable_review_record_accepted",
      review.approvedSurfaces,
      openCount,
    )
  }
  if (input.event === "STAGE_BINDING" && input.currentState === "review_record_accepted") {
    return accepted(
      "staged_for_runtime_binding",
      "active_tab_info_live_enable_staged",
      review.approvedSurfaces,
      openCount,
    )
  }
  if (input.event === "ENABLE_BINDING" && input.currentState === "staged_for_runtime_binding") {
    return openCount > 0
      ? accepted(
          "production_binding_enabled",
          "active_tab_info_live_enable_production_binding_detected",
          review.approvedSurfaces,
          openCount,
        )
      : rejected(
          "staged_for_runtime_binding",
          "active_tab_info_live_enable_transition_invalid",
          review.approvedSurfaces,
          openCount,
        )
  }

  return rejected(
    input.currentState,
    "active_tab_info_live_enable_transition_invalid",
    review.approvedSurfaces,
    openCount,
  )
}

export function buildYeonjangBrowserActiveTabInfoLiveEnableProjection(
  input: YeonjangBrowserActiveTabInfoLiveEnableTransitionInput,
): YeonjangBrowserActiveTabInfoLiveEnableProjection {
  const transition = transitionYeonjangBrowserActiveTabInfoLiveEnableState(input)
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-transition.v1",
    method: "browser.active_tab_info",
    visibility: "release_summary",
    state: transition.state,
    reasonCode: transition.reasonCode,
    transitionOk: transition.ok,
    approvedSurfaceCount: transition.approvedSurfaces.length,
    openSurfaceCount: transition.openSurfaceCount,
  }
}
