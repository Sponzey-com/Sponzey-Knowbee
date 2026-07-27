import { describe, expect, it } from "vitest"

import {
  buildReleaseActiveTabInfoAuditAccessProjectionMatrix,
  buildReleaseManifest,
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

describe("task224 release active tab info audit projection boundary", () => {
  it("keeps public approval and release projections count-only while audit payload is audit-only", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T00:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
    })
    const matrix = buildReleaseActiveTabInfoAuditAccessProjectionMatrix({ manifest })
    const serialized = JSON.stringify(matrix)

    expect(matrix).toMatchObject({
      schemaVersion: "knowbee.active-tab-info-audit-access-projection.v1",
      method: "browser.active_tab_info",
    })
    expect(matrix.entries.map((entry) => entry.surface)).toEqual([
      "release_summary",
      "release_package_dry_run_json",
      "release_approval_cli_output",
      "release_prepared_candidate_cli_output",
      "release_manifest_public_fields",
      "final_response",
      "product_log",
      "audit_artifact_descriptor",
      "audit_artifact_payload",
    ])

    const publicEntries = matrix.entries.filter((entry) => entry.audience === "release_operator")
    expect(publicEntries).toHaveLength(7)
    for (const entry of publicEntries) {
      expect(entry.rawDataAllowed).toBe(false)
      expect(entry.auditDetailPathsIncluded).toBe(false)
      if (entry.surface === "product_log") {
        expect(entry.allowedFields).toEqual(["activeTabInfoAuditArtifact.id"])
        continue
      }
      expect(entry.allowedFields).toEqual(
        expect.arrayContaining([
          "activeTabInfoAuditArtifact.id",
          "activeTabInfoAuditArtifact.checksum",
          "activeTabInfoAuditArtifact.packagePath",
          "evidenceCountSummary",
        ]),
      )
      expect(entry.allowedFields).not.toContain("evidenceCompleteness.auditDetailPaths")
      expect(entry.forbiddenDataClasses).toEqual(
        expect.arrayContaining([
          "raw_audit_json_content",
          "raw_test_runner_stdout",
          "raw_browser_tab_data",
          "url",
          "local_absolute_path",
        ]),
      )
      expect(entry.activeTabInfoAuditArtifact).toEqual({
        id: manifest.yeonjangBrowserActiveTabInfoAuditArtifact.id,
        checksum: manifest.yeonjangBrowserActiveTabInfoAuditArtifact.checksum,
        packagePath: manifest.yeonjangBrowserActiveTabInfoAuditArtifact.packagePath,
      })
      expect(entry.evidenceCountSummary).toMatchObject({
        missingSourceCount: 0,
        missingTestCount: 0,
        staleTestCount: 0,
        rejectedSkippedTestCount: 0,
        rejectedUnknownTestCount: 0,
        rejectedPublicRawReportCount: 0,
        failingTestCount: 0,
      })
    }

    const auditPayload = matrix.entries.find((entry) => entry.surface === "audit_artifact_payload")
    expect(auditPayload).toMatchObject({
      audience: "audit_operator",
      visibility: "audit_only",
      rawDataAllowed: false,
      auditDetailPathsIncluded: true,
    })
    expect(auditPayload?.allowedFields).toContain("evidenceCompleteness.auditDetailPaths")

    expect(serialized).not.toMatch(
      /missingSourcePaths|missingTestPaths|staleTestPaths|rejectedSkippedTestPaths|rejectedUnknownTestPaths|rejectedPublicRawReportPaths|failingTestPaths|https?:\/\/|\/Users\/|\/private\//iu,
    )
  })
})
