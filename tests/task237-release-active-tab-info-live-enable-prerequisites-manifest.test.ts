import { describe, expect, it } from "vitest"

import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
} from "../packages/core/src/release/package.ts"
import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-evidence-collector.ts"

const CHECKSUM = `sha256:${"c".repeat(64)}` as const
const REVIEWER = `sha256:${"d".repeat(64)}` as const

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

function acceptedReviewRecord() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review.v1",
    method: "browser.active_tab_info",
    reviewId: "review:active-tab-info-prerequisite-manifest",
    reviewerIdentityHash: REVIEWER,
    approvedAt: "2026-07-22T00:00:00.000Z",
    expiresAt: "2026-07-23T00:00:00.000Z",
    approvedSurfaces: [
      "rust_live_handler",
      "skill_mapping",
      "production_binding",
      "default_live_smoke",
    ],
    evidenceChecksums: [CHECKSUM],
    redactionPrivacyAcknowledged: true,
    rollbackCondition: {
      reasonCode: "active_tab_info_prerequisite_manifest_rollback",
      disableSurfaces: [
        "rust_live_handler",
        "skill_mapping",
        "production_binding",
        "default_live_smoke",
      ],
    },
  } as const
}

describe("Task 237 release active tab info live enable prerequisites manifest", () => {
  it("adds sanitized prerequisite projection to manifest without activating runtime bindings", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T01:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
      yeonjangBrowserActiveTabInfoLiveEnableReviewRecord: acceptedReviewRecord(),
    })

    expect(manifest.yeonjangBrowserActiveTabInfoLiveEnablePrerequisites).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-prerequisites.v1",
      method: "browser.active_tab_info",
      status: "ready_for_explicit_enable_task",
      missingPrerequisites: [],
      blockingReasonCodes: [],
      requiredPrerequisites: [
        "production_exposure_audit",
        "manual_review_record",
        "runtime_transition_state_machine",
        "release_approval_evidence",
        "final_product_log_boundary",
        "operator_wording",
        "task_evidence",
      ],
      explicitEnableTaskRequired: true,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
    expect(manifest.yeonjangBrowserActiveTabInfoReleaseGate).toMatchObject({
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("keeps prerequisite projection out of release approval evidence", () => {
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

    expect(serialized).not.toContain("yeonjangBrowserActiveTabInfoLiveEnablePrerequisites")
    expect(serialized).not.toContain("ready_for_explicit_enable_task")
    expect(serialized).not.toContain(CHECKSUM)
    expect(serialized).not.toContain(REVIEWER)
    expect(serialized).not.toMatch(/review:active-tab-info-prerequisite-manifest|https?:\/\/|\/Users\/|token=|raw title|raw url/iu)
  })
})
