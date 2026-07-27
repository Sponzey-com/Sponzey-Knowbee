import { describe, expect, it } from "vitest"

import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"
import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-evidence-collector.ts"

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

describe("task226 release approval evidence validator", () => {
  it("normalizes manifest-generated approval evidence without raw audit detail paths", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T00:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
    })
    const evidence = buildReleaseApprovalEvidenceProjection({ manifest })

    const validation = validateReleaseApprovalEvidenceProjection(evidence)

    expect(validation).toEqual({ status: "valid", evidence })
    expect(JSON.stringify(validation)).not.toMatch(
      /auditDetailPaths|missingSourcePaths|missingTestPaths|stdout|stderr|stack trace|raw output|https?:\/\/|\/Users\/|\/private\//iu,
    )
  })

  it.each([
    [undefined, "release_approval_evidence_required"],
    [{ schemaVersion: "wrong" }, "release_approval_evidence_invalid"],
    [
      {
        schemaVersion: "knowbee.release-approval-evidence.v1",
        readiness: { status: "ready", blockerCodes: ["live_acceptance_failed"] },
        activeTabInfoAuditArtifact: {
          id: "yeonjang:browser-active-tab-info:evidence",
          checksum: "a".repeat(64),
          packagePath: "audit/yeonjang/browser-active-tab-info-evidence.json",
        },
        activeTabInfoEvidenceCompleteness: {
          missingSourceCount: 0,
          missingTestCount: 0,
          staleTestCount: 0,
          rejectedSkippedTestCount: 0,
          rejectedUnknownTestCount: 0,
          rejectedPublicRawReportCount: 0,
          failingTestCount: 0,
        },
      },
      "release_approval_evidence_invalid",
    ],
    [
      {
        schemaVersion: "knowbee.release-approval-evidence.v1",
        readiness: { status: "blocked", blockerCodes: ["live_acceptance_failed"] },
        activeTabInfoAuditArtifact: {
          id: "yeonjang:browser-active-tab-info:evidence",
          checksum: "not-a-checksum",
          packagePath: "audit/yeonjang/browser-active-tab-info-evidence.json",
        },
        activeTabInfoEvidenceCompleteness: {
          missingSourceCount: 0,
          missingTestCount: 0,
          staleTestCount: 0,
          rejectedSkippedTestCount: 0,
          rejectedUnknownTestCount: 0,
          rejectedPublicRawReportCount: 0,
          failingTestCount: 0,
        },
      },
      "release_approval_evidence_invalid",
    ],
    [
      {
        schemaVersion: "knowbee.release-approval-evidence.v1",
        readiness: { status: "blocked", blockerCodes: ["live_acceptance_failed"] },
        rawAuditJson: { stdout: "raw output", url: "https://internal.example" },
      },
      "release_approval_evidence_raw_data",
    ],
  ] as const)("rejects invalid approval evidence with %s", (value, reasonCode) => {
    expect(validateReleaseApprovalEvidenceProjection(value)).toEqual({
      status: "rejected",
      reasonCode,
    })
  })
})
