import { describe, expect, it } from "vitest"

import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import {
  buildYeonjangBrowserActiveTabInfoLiveEnableProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-state-machine.ts"
import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-evidence-collector.ts"

const REVIEWER = `sha256:${"3".repeat(64)}` as const
const CHECKSUM = `sha256:${"4".repeat(64)}` as const
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

function reviewRecord() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review.v1",
    method: "browser.active_tab_info",
    reviewId: "review:active-tab-info-runtime-projection",
    reviewerIdentityHash: REVIEWER,
    approvedAt: "2026-07-22T00:00:00.000Z",
    expiresAt: "2026-07-23T00:00:00.000Z",
    approvedSurfaces: ["rust_live_handler"],
    evidenceChecksums: [CHECKSUM],
    redactionPrivacyAcknowledged: true,
    rollbackCondition: {
      reasonCode: "active_tab_info_runtime_projection_rollback",
      disableSurfaces: ["rust_live_handler"],
    },
  } as const
}

function completeEvidence() {
  return {
    moduleEvidence: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
      gateId: requirement.gateId,
      present: true,
    })),
    testEvidence: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
      testPath: requirement.testPath,
      status: "passed" as const,
    })),
  }
}

describe("Task 232 release active tab info runtime transition projection", () => {
  it("projects missing evidence as inventory-only release summary", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T01:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: {
        moduleEvidence: [],
        testEvidence: [],
      },
    })

    expect(manifest.yeonjangBrowserActiveTabInfoRuntimeTransition).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-transition.v1",
      method: "browser.active_tab_info",
      visibility: "release_summary",
      state: "inventory_only",
      reasonCode: "active_tab_info_live_enable_missing_evidence",
      transitionOk: false,
      approvedSurfaceCount: 0,
      openSurfaceCount: 0,
    })
  })

  it("projects accepted review with closed surfaces without opening runtime bindings", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T01:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeEvidence(),
      yeonjangBrowserActiveTabInfoLiveEnableReviewRecord: reviewRecord(),
    })

    expect(manifest.yeonjangBrowserActiveTabInfoRuntimeTransition).toMatchObject({
      state: "review_record_accepted",
      reasonCode: "active_tab_info_live_enable_review_record_accepted",
      transitionOk: true,
      approvedSurfaceCount: 1,
      openSurfaceCount: 0,
    })
    expect(manifest.yeonjangBrowserActiveTabInfoReleaseGate).toMatchObject({
      addRustDispatchNow: false,
      addProductionBindingNow: false,
      enableSkillMappingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
    expect(manifest.releaseNotes.knownLimitations).toContain(
      "Yeonjang browser.active_tab_info runtime transition: review_record_accepted reason=active_tab_info_live_enable_review_record_accepted openSurfaces=0.",
    )
    expect(JSON.stringify(manifest.yeonjangBrowserActiveTabInfoRuntimeTransition)).not.toContain(CHECKSUM)
    expect(JSON.stringify(manifest.yeonjangBrowserActiveTabInfoRuntimeTransition)).not.toContain(REVIEWER)
    expect(JSON.stringify(manifest.yeonjangBrowserActiveTabInfoRuntimeTransition)).not.toMatch(
      /review:active-tab-info-runtime-projection|https?:\/\/|\/Users\/|token=/iu,
    )
  })

  it("projects pre-open exposure, rollback, and disable events as sanitized summaries", () => {
    expect(buildYeonjangBrowserActiveTabInfoLiveEnableProjection({
      currentState: "review_ready",
      event: "REVIEW_ACCEPTED",
      evidenceReady: true,
      reviewRecord: reviewRecord(),
      liveIntegrationState: OPEN,
      now: new Date("2026-07-22T01:00:00.000Z"),
    })).toMatchObject({
      state: "rollback_required",
      reasonCode: "active_tab_info_live_enable_production_exposure_open_before_stage",
      transitionOk: false,
      approvedSurfaceCount: 0,
      openSurfaceCount: 1,
    })
    expect(buildYeonjangBrowserActiveTabInfoLiveEnableProjection({
      currentState: "production_binding_enabled",
      event: "ROLLBACK_TRIGGERED",
      evidenceReady: true,
      reviewRecord: reviewRecord(),
      liveIntegrationState: OPEN,
      now: new Date("2026-07-22T01:00:00.000Z"),
    })).toMatchObject({
      state: "rollback_required",
      reasonCode: "active_tab_info_live_enable_rollback_required",
      transitionOk: false,
      openSurfaceCount: 1,
    })
    expect(buildYeonjangBrowserActiveTabInfoLiveEnableProjection({
      currentState: "rollback_required",
      event: "DISABLE",
      evidenceReady: false,
      liveIntegrationState: CLOSED,
    })).toMatchObject({
      state: "disabled",
      reasonCode: "active_tab_info_live_enable_disabled",
      transitionOk: true,
      approvedSurfaceCount: 0,
      openSurfaceCount: 0,
    })
  })
})
