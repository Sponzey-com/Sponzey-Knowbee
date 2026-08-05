import { describe, expect, it } from "vitest"

import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
  collectYeonjangBrowserActiveTabInfoReleaseGateEvidenceFromRepository,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-evidence-collector.ts"

const LIVE_DISABLED = {
  rustLiveHandlerEnabled: false,
  skillMappingEnabled: false,
  productionBindingEnabled: false,
  defaultLiveSmokeEnabled: false,
}

describe("Task 220 Yeonjang browser.active_tab_info release gate repository evidence adapter", () => {
  it("collects source module and test evidence through an explicit repository boundary port", () => {
    const existingPaths = new Set(
      ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.flatMap((requirement) => [
        requirement.modulePath,
        requirement.testPath,
      ]),
    )
    const inspectedPaths: string[] = []
    const collected = collectYeonjangBrowserActiveTabInfoReleaseGateEvidenceFromRepository({
      evidencePort: {
        existsFile(relativePath) {
          inspectedPaths.push(relativePath)
          return existingPaths.has(relativePath)
        },
        getTestStatus(testPath) {
          return existingPaths.has(testPath) ? "passed" : "missing"
        },
      },
      publicRawLeakDetected: false,
      reviewBypassDetected: false,
      unsafeEvidenceRefDetected: false,
      liveIntegrationState: LIVE_DISABLED,
    })

    expect(collected.missingSourcePaths).toEqual([])
    expect(collected.missingTestPaths).toEqual([])
    expect(collected.missingModuleGateIds).toEqual([])
    expect(collected.failingTestPaths).toEqual([])
    expect(collected.releaseGateSummary.gateStatus).toBe("ready_for_manual_live_integration_review")
    expect(inspectedPaths).toEqual(
      [
        ...ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => requirement.modulePath),
        ...ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => requirement.testPath),
      ],
    )
    expect(inspectedPaths.every((path) => !path.startsWith("/") && !path.includes(".."))).toBe(true)
  })

  it("fails closed when repository source or test files are missing", () => {
    const missingSource = "packages/core/src/release/yeonjang-browser-active-tab-info-review-ready-bundle.ts"
    const missingTest = "tests/task216-yeonjang-browser-active-tab-info-review-ready-bundle.test.ts"
    const existingPaths = new Set(
      ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS
        .flatMap((requirement) => [requirement.modulePath, requirement.testPath])
        .filter((path) => path !== missingSource && path !== missingTest),
    )
    const collected = collectYeonjangBrowserActiveTabInfoReleaseGateEvidenceFromRepository({
      evidencePort: {
        existsFile(relativePath) {
          return existingPaths.has(relativePath)
        },
        getTestStatus(testPath) {
          return existingPaths.has(testPath) ? "passed" : "missing"
        },
      },
      publicRawLeakDetected: false,
      reviewBypassDetected: false,
      unsafeEvidenceRefDetected: false,
      liveIntegrationState: LIVE_DISABLED,
    })

    expect(collected.missingSourcePaths).toEqual([missingSource])
    expect(collected.missingTestPaths).toEqual([missingTest])
    expect(collected.missingModuleGateIds).toEqual(["review_ready_bundle"])
    expect(collected.failingTestPaths).toEqual([missingTest])
    expect(collected.releaseGateSummary.gateStatus).toBe("blocked")
    expect(collected.releaseGateSummary.blockingReasonCodes).toContain(
      "required_gate_missing:review_ready_bundle",
    )
  })

  it("does not treat test file existence as a passed test result without explicit status evidence", () => {
    const existingPaths = new Set(
      ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.flatMap((requirement) => [
        requirement.modulePath,
        requirement.testPath,
      ]),
    )
    const collected = collectYeonjangBrowserActiveTabInfoReleaseGateEvidenceFromRepository({
      evidencePort: {
        existsFile(relativePath) {
          return existingPaths.has(relativePath)
        },
      },
      publicRawLeakDetected: false,
      reviewBypassDetected: false,
      unsafeEvidenceRefDetected: false,
      liveIntegrationState: LIVE_DISABLED,
    })

    expect(collected.missingSourcePaths).toEqual([])
    expect(collected.missingTestPaths).toEqual([])
    expect(collected.failingTestPaths).toEqual(
      ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => requirement.testPath),
    )
    expect(collected.releaseGateSummary.gateStatus).toBe("blocked")
  })
})
