import { describe, expect, it } from "vitest"

import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
  collectYeonjangBrowserActiveTabInfoReleaseGateEvidence,
  normalizeYeonjangBrowserActiveTabInfoReleaseGateTestStatusEvidence,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-evidence-collector.ts"

const MODULE_EVIDENCE = ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
  gateId: requirement.gateId,
  present: true,
}))

const LIVE_DISABLED = {
  rustLiveHandlerEnabled: false,
  skillMappingEnabled: false,
  productionBindingEnabled: false,
  defaultLiveSmokeEnabled: false,
}

function collectWithNormalizedTests(
  testEvidence: ReturnType<typeof normalizeYeonjangBrowserActiveTabInfoReleaseGateTestStatusEvidence>["testEvidence"],
) {
  return collectYeonjangBrowserActiveTabInfoReleaseGateEvidence({
    moduleEvidence: MODULE_EVIDENCE,
    testEvidence,
    publicRawLeakDetected: false,
    reviewBypassDetected: false,
    unsafeEvidenceRefDetected: false,
    liveIntegrationState: LIVE_DISABLED,
  })
}

describe("Task 222 active tab info release gate test status evidence format", () => {
  it("normalizes fresh audit-only passed test evidence into release gate passed status", () => {
    const normalized = normalizeYeonjangBrowserActiveTabInfoReleaseGateTestStatusEvidence({
      evidence: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
        testPath: requirement.testPath,
        status: "passed",
        executedAt: 1_000,
        sourceKind: "vitest",
        rawReportVisibility: "audit_only",
      })),
      now: 1_500,
      maxAgeMs: 1_000,
    })
    const collected = collectWithNormalizedTests(normalized.testEvidence)

    expect(normalized.staleTestPaths).toEqual([])
    expect(normalized.missingTestStatusPaths).toEqual([])
    expect(normalized.rejectedRawReportVisibilityPaths).toEqual([])
    expect(collected.releaseGateSummary.gateStatus).toBe("ready_for_manual_live_integration_review")
  })

  it("marks stale test status evidence as blocked even when the previous result passed", () => {
    const stalePath = "tests/task216-yeonjang-browser-active-tab-info-review-ready-bundle.test.ts"
    const normalized = normalizeYeonjangBrowserActiveTabInfoReleaseGateTestStatusEvidence({
      evidence: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
        testPath: requirement.testPath,
        status: "passed",
        executedAt: requirement.testPath === stalePath ? 100 : 1_400,
        sourceKind: "ci_summary",
        rawReportVisibility: "audit_only",
      })),
      now: 1_500,
      maxAgeMs: 1_000,
    })
    const collected = collectWithNormalizedTests(normalized.testEvidence)

    expect(normalized.staleTestPaths).toEqual([stalePath])
    expect(collected.failingTestPaths).toContain(stalePath)
    expect(collected.summaryInput.reviewReadyBundleReady).toBe(false)
    expect(collected.releaseGateSummary.gateStatus).toBe("blocked")
    expect(collected.releaseGateSummary.blockingReasonCodes).toContain(
      "required_gate_missing:review_ready_bundle",
    )
  })

  it("rejects public raw report visibility and does not expose raw runner output", () => {
    const rejectedPath = "tests/task214-yeonjang-browser-active-tab-info-runtime-result-assembler.test.ts"
    const normalized = normalizeYeonjangBrowserActiveTabInfoReleaseGateTestStatusEvidence({
      evidence: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
        testPath: requirement.testPath,
        status: "passed",
        executedAt: 1_000,
        sourceKind: "junit",
        rawReportVisibility: requirement.testPath === rejectedPath ? "public" : "audit_only",
      })),
      now: 1_500,
      maxAgeMs: 1_000,
    })
    const collected = collectWithNormalizedTests(normalized.testEvidence)

    expect(normalized.rejectedRawReportVisibilityPaths).toEqual([rejectedPath])
    expect(normalized.testEvidence.find((item) => item.testPath === rejectedPath)).toEqual({
      testPath: rejectedPath,
      status: "missing",
    })
    expect(JSON.stringify(normalized)).not.toMatch(/raw output|stdout|stderr|stack trace/iu)
    expect(collected.summaryInput.runtimeAssemblerReady).toBe(false)
    expect(collected.releaseGateSummary.gateStatus).toBe("blocked")
  })

  it("requires every release gate test path to have explicit status evidence", () => {
    const omittedPath = "tests/task213-yeonjang-browser-active-tab-info-safe-evidence-ref.test.ts"
    const normalized = normalizeYeonjangBrowserActiveTabInfoReleaseGateTestStatusEvidence({
      evidence: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS
        .filter((requirement) => requirement.testPath !== omittedPath)
        .map((requirement) => ({
          testPath: requirement.testPath,
          status: "passed",
          executedAt: 1_000,
          sourceKind: "manual_fixture",
          rawReportVisibility: "audit_only",
        })),
      now: 1_500,
      maxAgeMs: 1_000,
    })
    const collected = collectWithNormalizedTests(normalized.testEvidence)

    expect(normalized.missingTestStatusPaths).toEqual([omittedPath])
    expect(collected.failingTestPaths).toContain(omittedPath)
    expect(collected.summaryInput.safeEvidenceRefReady).toBe(false)
    expect(collected.releaseGateSummary.gateStatus).toBe("blocked")
  })
})
