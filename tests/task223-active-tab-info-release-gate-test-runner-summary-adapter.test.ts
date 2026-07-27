import { describe, expect, it } from "vitest"

import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
  adaptYeonjangBrowserActiveTabInfoReleaseGateTestRunnerSummary,
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

function collectFromRunnerRecords(
  records: Parameters<typeof adaptYeonjangBrowserActiveTabInfoReleaseGateTestRunnerSummary>[0]["records"],
) {
  const adapted = adaptYeonjangBrowserActiveTabInfoReleaseGateTestRunnerSummary({ records })
  const normalized = normalizeYeonjangBrowserActiveTabInfoReleaseGateTestStatusEvidence({
    evidence: adapted.evidence,
    now: 2_000,
    maxAgeMs: 1_000,
  })
  return {
    adapted,
    normalized,
    collected: collectYeonjangBrowserActiveTabInfoReleaseGateEvidence({
      moduleEvidence: MODULE_EVIDENCE,
      testEvidence: normalized.testEvidence,
      publicRawLeakDetected: false,
      reviewBypassDetected: false,
      unsafeEvidenceRefDetected: false,
      liveIntegrationState: LIVE_DISABLED,
    }),
  }
}

describe("Task 223 active tab info release gate test runner summary adapter", () => {
  it("adapts known Vitest summary records into audit-only passed evidence", () => {
    const result = collectFromRunnerRecords(
      ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
        testPath: requirement.testPath,
        outcome: "passed",
        finishedAt: 1_500,
        sourceKind: "vitest",
        rawReportVisibility: "audit_only",
      })),
    )

    expect(result.adapted.rejectedUnknownTestPaths).toEqual([])
    expect(result.adapted.rejectedSkippedTestPaths).toEqual([])
    expect(result.normalized.rejectedRawReportVisibilityPaths).toEqual([])
    expect(result.collected.releaseGateSummary.gateStatus).toBe("ready_for_manual_live_integration_review")
  })

  it("rejects unknown test paths instead of adding them to release evidence", () => {
    const result = collectFromRunnerRecords([
      {
        testPath: "tests/unrelated.test.ts",
        outcome: "passed",
        finishedAt: 1_500,
        sourceKind: "ci_summary",
        rawReportVisibility: "audit_only",
      },
      ...ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.slice(1).map((requirement) => ({
        testPath: requirement.testPath,
        outcome: "passed" as const,
        finishedAt: 1_500,
        sourceKind: "ci_summary" as const,
        rawReportVisibility: "audit_only" as const,
      })),
    ])

    expect(result.adapted.rejectedUnknownTestPaths).toEqual(["tests/unrelated.test.ts"])
    expect(result.normalized.missingTestStatusPaths).toEqual([
      "tests/task200-yeonjang-browser-active-tab-info-readiness-route.test.ts",
    ])
    expect(result.collected.summaryInput.readinessProjectionReady).toBe(false)
    expect(result.collected.releaseGateSummary.gateStatus).toBe("blocked")
  })

  it("maps skipped required tests to missing evidence and blocks the gate", () => {
    const skippedPath = "tests/task215-yeonjang-browser-active-tab-info-postcheck-llm-review-admission.test.ts"
    const result = collectFromRunnerRecords(
      ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
        testPath: requirement.testPath,
        outcome: requirement.testPath === skippedPath ? "skipped" : "passed",
        finishedAt: 1_500,
        sourceKind: "junit",
        rawReportVisibility: "audit_only",
      })),
    )

    expect(result.adapted.rejectedSkippedTestPaths).toEqual([skippedPath])
    expect(result.normalized.testEvidence.find((item) => item.testPath === skippedPath)).toEqual({
      testPath: skippedPath,
      status: "missing",
    })
    expect(result.collected.summaryInput.llmReviewAdmissionReady).toBe(false)
    expect(result.collected.releaseGateSummary.gateStatus).toBe("blocked")
  })

  it("keeps public raw report visibility blocked after adapter normalization", () => {
    const publicPath = "tests/task212-yeonjang-browser-active-tab-info-final-result-boundary.test.ts"
    const result = collectFromRunnerRecords(
      ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
        testPath: requirement.testPath,
        outcome: "passed",
        finishedAt: 1_500,
        sourceKind: "vitest",
        rawReportVisibility: requirement.testPath === publicPath ? "public" : "audit_only",
      })),
    )

    expect(result.normalized.rejectedRawReportVisibilityPaths).toEqual([publicPath])
    expect(result.collected.summaryInput.finalProjectionBoundaryReady).toBe(false)
    expect(JSON.stringify(result.adapted)).not.toMatch(/stdout|stderr|stack trace|raw output/iu)
    expect(result.collected.releaseGateSummary.gateStatus).toBe("blocked")
  })
})
