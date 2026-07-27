import { describe, expect, it } from "vitest"

import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"
import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-evidence-collector.ts"

const CHECKSUM = `sha256:${"a".repeat(64)}` as const
const REVIEWER = `sha256:${"b".repeat(64)}` as const

function acceptedReviewRecord() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review.v1",
    method: "browser.active_tab_info",
    reviewId: "review:active-tab-info-runtime-transition-misuse-guard",
    reviewerIdentityHash: REVIEWER,
    approvedAt: "2026-07-22T00:00:00.000Z",
    expiresAt: "2026-07-23T00:00:00.000Z",
    approvedSurfaces: ["rust_live_handler", "skill_mapping"],
    evidenceChecksums: [CHECKSUM],
    redactionPrivacyAcknowledged: true,
    rollbackCondition: {
      reasonCode: "active_tab_info_runtime_transition_misuse_guard_rollback",
      disableSurfaces: ["rust_live_handler", "skill_mapping"],
    },
  } as const
}

function completeActiveTabInfoEvidence() {
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

describe("Task 233 release active tab info runtime transition misuse guard", () => {
  it("keeps runtime transition projection out of release approval evidence even when review is accepted", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T01:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
      yeonjangBrowserActiveTabInfoLiveEnableReviewRecord: acceptedReviewRecord(),
    })
    const projection = buildReleaseApprovalEvidenceProjection({
      manifest,
      readiness: evaluateReleaseReadiness(manifest),
    })
    const serialized = JSON.stringify(projection)

    expect(manifest.yeonjangBrowserActiveTabInfoRuntimeTransition).toMatchObject({
      state: "review_record_accepted",
      reasonCode: "active_tab_info_live_enable_review_record_accepted",
      transitionOk: true,
      openSurfaceCount: 0,
    })
    expect(serialized).not.toContain("yeonjangBrowserActiveTabInfoRuntimeTransition")
    expect(serialized).not.toContain("review_record_accepted")
    expect(serialized).not.toContain("active_tab_info_live_enable_review_record_accepted")
    expect(serialized).not.toContain(CHECKSUM)
    expect(serialized).not.toContain(REVIEWER)
  })

  it("rejects approval evidence input that tries to smuggle runtime transition projection into authorization", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T01:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
      yeonjangBrowserActiveTabInfoLiveEnableReviewRecord: acceptedReviewRecord(),
    })
    const projection = buildReleaseApprovalEvidenceProjection({
      manifest,
      readiness: evaluateReleaseReadiness(manifest),
    })

    const validation = validateReleaseApprovalEvidenceProjection({
      ...projection,
      yeonjangBrowserActiveTabInfoRuntimeTransition:
        manifest.yeonjangBrowserActiveTabInfoRuntimeTransition,
    })

    expect(validation).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })
})
