import { describe, expect, it } from "vitest"

import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
} from "../packages/core/src/release/package.ts"

const CHECKSUM = `sha256:${"e".repeat(64)}` as const
const REVIEWER = `sha256:${"f".repeat(64)}` as const

function acceptedReviewRecord() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review.v1",
    method: "browser.active_tab_info",
    reviewId: "review:active-tab-info-misuse-guard",
    reviewerIdentityHash: REVIEWER,
    approvedAt: "2026-07-22T00:00:00.000Z",
    expiresAt: "2026-07-23T00:00:00.000Z",
    approvedSurfaces: ["rust_live_handler", "skill_mapping"],
    evidenceChecksums: [CHECKSUM],
    redactionPrivacyAcknowledged: true,
    rollbackCondition: {
      reasonCode: "active_tab_info_review_misuse_guard_rollback",
      disableSurfaces: ["rust_live_handler", "skill_mapping"],
    },
  } as const
}

describe("Task 230 release active tab info review projection misuse guard", () => {
  it("does not let an accepted manual review projection clear active tab info release blockers", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T01:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: {
        moduleEvidence: [],
        testEvidence: [],
      },
      yeonjangBrowserActiveTabInfoLiveEnableReviewRecord: acceptedReviewRecord(),
    })

    const readiness = evaluateReleaseReadiness(manifest)

    expect(manifest.yeonjangBrowserActiveTabInfoLiveEnableReview.status).toBe("accepted")
    expect(manifest.yeonjangBrowserActiveTabInfoReleaseGate.gateStatus).toBe("blocked")
    expect(readiness.status).toBe("blocked")
    expect(readiness.blockerCodes).toContain("yeonjang_active_tab_info_release_gate_failed")
    expect(manifest.yeonjangBrowserActiveTabInfoReleaseGate).toMatchObject({
      addRustDispatchNow: false,
      addProductionBindingNow: false,
      enableSkillMappingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("keeps manual review hashes out of release approval evidence projection", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T01:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: {
        moduleEvidence: [],
        testEvidence: [],
      },
      yeonjangBrowserActiveTabInfoLiveEnableReviewRecord: acceptedReviewRecord(),
    })
    const projection = buildReleaseApprovalEvidenceProjection({
      manifest,
      readiness: evaluateReleaseReadiness(manifest),
    })
    const serialized = JSON.stringify(projection)

    expect(projection.readiness.blockerCodes).toContain("yeonjang_active_tab_info_release_gate_failed")
    expect(serialized).not.toContain("review:active-tab-info-misuse-guard")
    expect(serialized).not.toContain(REVIEWER)
    expect(serialized).not.toContain(CHECKSUM)
    expect(serialized).not.toContain("reviewIdHash")
    expect(serialized).not.toContain("reviewerIdentityHash")
    expect(serialized).not.toMatch(/https?:\/\/|\/Users\/|token=|raw title|raw url/iu)
  })
})
