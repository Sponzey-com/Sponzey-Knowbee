import { describe, expect, it } from "vitest"

import {
  transitionYeonjangBrowserActiveTabInfoLiveEnableState,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-state-machine.ts"

const REVIEWER = `sha256:${"1".repeat(64)}` as const
const CHECKSUM = `sha256:${"2".repeat(64)}` as const
const CLOSED = {
  rustLiveHandlerEnabled: false,
  skillMappingEnabled: false,
  productionBindingEnabled: false,
  defaultLiveSmokeEnabled: false,
} as const
const OPEN = {
  rustLiveHandlerEnabled: true,
  skillMappingEnabled: false,
  productionBindingEnabled: false,
  defaultLiveSmokeEnabled: false,
} as const

function reviewRecord(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review.v1",
    method: "browser.active_tab_info",
    reviewId: "review:active-tab-info-state-machine",
    reviewerIdentityHash: REVIEWER,
    approvedAt: "2026-07-22T00:00:00.000Z",
    expiresAt: "2026-07-23T00:00:00.000Z",
    approvedSurfaces: ["rust_live_handler"],
    evidenceChecksums: [CHECKSUM],
    redactionPrivacyAcknowledged: true,
    rollbackCondition: {
      reasonCode: "active_tab_info_state_machine_rollback",
      disableSurfaces: ["rust_live_handler"],
    },
    ...overrides,
  } as const
}

describe("Task 231 Yeonjang browser.active_tab_info live enable state machine", () => {
  it("moves through review and staging states without opening production surfaces", () => {
    const now = new Date("2026-07-22T01:00:00.000Z")

    expect(transitionYeonjangBrowserActiveTabInfoLiveEnableState({
      currentState: "inventory_only",
      event: "EVIDENCE_READY",
      evidenceReady: true,
      liveIntegrationState: CLOSED,
      now,
    })).toMatchObject({
      ok: true,
      state: "review_ready",
      reasonCode: "active_tab_info_live_enable_review_ready",
      openSurfaceCount: 0,
    })
    expect(transitionYeonjangBrowserActiveTabInfoLiveEnableState({
      currentState: "review_ready",
      event: "REVIEW_ACCEPTED",
      evidenceReady: true,
      reviewRecord: reviewRecord(),
      liveIntegrationState: CLOSED,
      now,
    })).toMatchObject({
      ok: true,
      state: "review_record_accepted",
      reasonCode: "active_tab_info_live_enable_review_record_accepted",
      approvedSurfaces: ["rust_live_handler"],
      openSurfaceCount: 0,
    })
    expect(transitionYeonjangBrowserActiveTabInfoLiveEnableState({
      currentState: "review_record_accepted",
      event: "STAGE_BINDING",
      evidenceReady: true,
      reviewRecord: reviewRecord(),
      liveIntegrationState: CLOSED,
      now,
    })).toMatchObject({
      ok: true,
      state: "staged_for_runtime_binding",
      reasonCode: "active_tab_info_live_enable_staged",
      openSurfaceCount: 0,
    })
  })

  it("fails closed for missing evidence, rejected review records, and expired reviews", () => {
    const now = new Date("2026-07-22T01:00:00.000Z")

    expect(transitionYeonjangBrowserActiveTabInfoLiveEnableState({
      currentState: "inventory_only",
      event: "EVIDENCE_READY",
      evidenceReady: false,
      liveIntegrationState: CLOSED,
      now,
    })).toMatchObject({
      ok: false,
      state: "inventory_only",
      reasonCode: "active_tab_info_live_enable_missing_evidence",
    })
    expect(transitionYeonjangBrowserActiveTabInfoLiveEnableState({
      currentState: "review_ready",
      event: "REVIEW_ACCEPTED",
      evidenceReady: true,
      reviewRecord: reviewRecord({ evidenceChecksums: ["raw-output"] }),
      liveIntegrationState: CLOSED,
      now,
    })).toMatchObject({
      ok: false,
      state: "review_ready",
      reasonCode: "active_tab_info_live_enable_review_rejected",
      reviewReasonCode: "active_tab_info_live_enable_review_evidence_invalid",
    })
    expect(transitionYeonjangBrowserActiveTabInfoLiveEnableState({
      currentState: "review_ready",
      event: "REVIEW_ACCEPTED",
      evidenceReady: true,
      reviewRecord: reviewRecord({ expiresAt: "2026-07-22T00:30:00.000Z" }),
      liveIntegrationState: CLOSED,
      now,
    })).toMatchObject({
      ok: false,
      state: "review_ready",
      reasonCode: "active_tab_info_live_enable_review_rejected",
      reviewReasonCode: "active_tab_info_live_enable_review_expired",
    })
  })

  it("requires rollback when production exposure appears before staging", () => {
    expect(transitionYeonjangBrowserActiveTabInfoLiveEnableState({
      currentState: "review_ready",
      event: "REVIEW_ACCEPTED",
      evidenceReady: true,
      reviewRecord: reviewRecord(),
      liveIntegrationState: OPEN,
      now: new Date("2026-07-22T01:00:00.000Z"),
    })).toMatchObject({
      ok: false,
      state: "rollback_required",
      reasonCode: "active_tab_info_live_enable_production_exposure_open_before_stage",
      openSurfaceCount: 1,
    })
  })

  it("handles rollback and disable as explicit events", () => {
    expect(transitionYeonjangBrowserActiveTabInfoLiveEnableState({
      currentState: "production_binding_enabled",
      event: "ROLLBACK_TRIGGERED",
      evidenceReady: true,
      reviewRecord: reviewRecord(),
      liveIntegrationState: OPEN,
      now: new Date("2026-07-22T01:00:00.000Z"),
    })).toMatchObject({
      ok: false,
      state: "rollback_required",
      reasonCode: "active_tab_info_live_enable_rollback_required",
    })
    expect(transitionYeonjangBrowserActiveTabInfoLiveEnableState({
      currentState: "rollback_required",
      event: "DISABLE",
      evidenceReady: false,
      liveIntegrationState: CLOSED,
    })).toMatchObject({
      ok: true,
      state: "disabled",
      reasonCode: "active_tab_info_live_enable_disabled",
    })
  })

  it("does not treat a staged closed binding as production enabled", () => {
    expect(transitionYeonjangBrowserActiveTabInfoLiveEnableState({
      currentState: "staged_for_runtime_binding",
      event: "ENABLE_BINDING",
      evidenceReady: true,
      reviewRecord: reviewRecord(),
      liveIntegrationState: CLOSED,
      now: new Date("2026-07-22T01:00:00.000Z"),
    })).toMatchObject({
      ok: false,
      state: "staged_for_runtime_binding",
      reasonCode: "active_tab_info_live_enable_transition_invalid",
      openSurfaceCount: 0,
    })
  })
})
