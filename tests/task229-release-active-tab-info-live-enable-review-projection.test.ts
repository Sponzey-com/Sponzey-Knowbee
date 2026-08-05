import { describe, expect, it } from "vitest"

import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import {
  buildYeonjangBrowserActiveTabInfoLiveEnableReviewProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-review.ts"
import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-evidence-collector.ts"

const CHECKSUM = `sha256:${"c".repeat(64)}` as const
const REVIEWER = `sha256:${"d".repeat(64)}` as const

function reviewRecord() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review.v1",
    method: "browser.active_tab_info",
    reviewId: "review:active-tab-info-release-001",
    reviewerIdentityHash: REVIEWER,
    approvedAt: "2026-07-22T00:00:00.000Z",
    expiresAt: "2026-07-23T00:00:00.000Z",
    approvedSurfaces: ["rust_live_handler", "skill_mapping", "production_binding", "default_live_smoke"],
    evidenceChecksums: [CHECKSUM],
    redactionPrivacyAcknowledged: true,
    rollbackCondition: {
      reasonCode: "active_tab_info_runtime_review_rollback",
      disableSurfaces: ["rust_live_handler", "skill_mapping", "production_binding", "default_live_smoke"],
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

describe("Task 229 release active tab info live enable review projection", () => {
  it("projects accepted review records as sanitized release summary data only", () => {
    const projection = buildYeonjangBrowserActiveTabInfoLiveEnableReviewProjection(reviewRecord(), {
      now: new Date("2026-07-22T01:00:00.000Z"),
    })

    expect(projection).toMatchObject({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review-projection.v1",
      method: "browser.active_tab_info",
      status: "accepted",
      visibility: "release_summary",
      reasonCode: "active_tab_info_live_enable_review_accepted",
      reviewerIdentityHash: REVIEWER,
      approvedSurfaceCount: 4,
      evidenceChecksumCount: 1,
      rollbackSurfaceCount: 4,
      expiresAt: "2026-07-23T00:00:00.000Z",
    })
    expect(projection).toHaveProperty("reviewIdHash")
    expect(JSON.stringify(projection)).not.toContain("review:active-tab-info-release-001")
    expect(JSON.stringify(projection)).not.toContain(CHECKSUM)
    expect(JSON.stringify(projection)).not.toMatch(/https?:\/\/|\/Users\/|token=|raw title|raw url/iu)
  })

  it("adds the sanitized projection to the release manifest without opening live paths", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T01:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeEvidence(),
      yeonjangBrowserActiveTabInfoLiveEnableReviewRecord: reviewRecord(),
    })

    expect(manifest.yeonjangBrowserActiveTabInfoLiveEnableReview).toMatchObject({
      status: "accepted",
      approvedSurfaceCount: 4,
      evidenceChecksumCount: 1,
      rollbackSurfaceCount: 4,
    })
    expect(manifest.yeonjangBrowserActiveTabInfoReleaseGate).toMatchObject({
      addRustDispatchNow: false,
      addProductionBindingNow: false,
      enableSkillMappingNow: false,
      enableDefaultLiveSmokeNow: false,
      liveIntegrationState: {
        rustLiveHandlerEnabled: false,
        skillMappingEnabled: false,
        productionBindingEnabled: false,
        defaultLiveSmokeEnabled: false,
      },
    })
    expect(manifest.releaseNotes.knownLimitations).toContain(
      "Yeonjang browser.active_tab_info manual review record: accepted (surfaces=4, evidenceChecksums=1, rollbackSurfaces=4).",
    )
    expect(JSON.stringify(manifest.yeonjangBrowserActiveTabInfoLiveEnableReview)).not.toContain(CHECKSUM)
    expect(JSON.stringify(manifest.releaseNotes)).not.toContain("review:active-tab-info-release-001")
  })

  it("keeps missing or invalid review records as sanitized release summary status", () => {
    const missing = buildYeonjangBrowserActiveTabInfoLiveEnableReviewProjection(undefined, {
      now: new Date("2026-07-22T01:00:00.000Z"),
    })
    const rejected = buildYeonjangBrowserActiveTabInfoLiveEnableReviewProjection({
      ...reviewRecord(),
      evidenceChecksums: ["https://example.test/raw?token=secret"],
    }, {
      now: new Date("2026-07-22T01:00:00.000Z"),
    })

    expect(missing).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review-projection.v1",
      method: "browser.active_tab_info",
      status: "not_provided",
      visibility: "release_summary",
      reasonCode: "active_tab_info_live_enable_review_required",
      approvedSurfaceCount: 0,
      evidenceChecksumCount: 0,
      rollbackSurfaceCount: 0,
    })
    expect(rejected).toMatchObject({
      status: "rejected",
      reasonCode: "active_tab_info_live_enable_review_raw_data",
      approvedSurfaceCount: 0,
      evidenceChecksumCount: 0,
      rollbackSurfaceCount: 0,
    })
    expect(JSON.stringify(rejected)).not.toMatch(/https?:\/\/|token=|secret/u)
  })
})
