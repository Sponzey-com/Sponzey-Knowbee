import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  writePreparedReleasePackage,
} from "../packages/core/src/release/package.ts"
import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-evidence-collector.ts"

const REQUIRED_SOURCE_COUNT = new Set(
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => requirement.modulePath),
).size
const REQUIRED_TEST_COUNT = ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.length

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

function makeActiveTabInfoOnlyReadyForWrite(manifest: ReturnType<typeof buildReleaseManifest>): void {
  manifest.requiredMissing = []
  manifest.updatePreflight.ok = true
  manifest.migrationPreflight.ok = true
  manifest.performanceEvidence.gateStatus = "passed"
  manifest.benchmarkEvidence.gateStatus = "passed"
  manifest.subAgentReleaseGate.gateStatus = "passed"
  manifest.enterpriseTopologyReleaseGate.gateStatus = "passed"
  manifest.orchestrationEvidence.gateStatus = "passed"
  manifest.webRetrievalEvidence.gateStatus = "passed"
  manifest.uiModeEvidence.gateStatus = "passed"
  manifest.yeonjangMultiInstanceEvidence.gateStatus = "passed"
  manifest.memoryCompactionEvidence.gateStatus = "passed"
  manifest.liveAcceptance = { status: "admitted", reasonCodes: [], acceptedEvidenceRefs: [] }
  manifest.operationalRehearsalEvidence = {
    ...manifest.operationalRehearsalEvidence,
    npmInstall: {
      status: "verified",
      reasonCode: null,
      packageVersion: manifest.appVersion,
      packageSetDigestSha256: "a".repeat(64),
    },
    backupRestore: {
      status: "verified",
      reasonCode: null,
      snapshotId: "snapshot:active-tab-info",
      snapshotChecksum: "b".repeat(64),
      schemaVersion: manifest.migrationPreflight.latestSchemaVersion,
    },
    artifactCleanupSmoke: {
      status: "verified",
      reasonCode: null,
      checked: ["preview", "confirmation_failure"],
      destructiveFixtureVerified: false,
    },
  }
}

describe("Task 221 release manifest active tab info evidence input", () => {
  it("fails closed when active tab info release gate evidence is not provided", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T00:00:00.000Z"),
    })

    expect(manifest.yeonjangBrowserActiveTabInfoReleaseGate.gateStatus).toBe("blocked")
    expect(manifest.yeonjangBrowserActiveTabInfoReleaseGate.blockingReasonCodes).toContain(
      "required_gate_missing:readiness_projection",
    )
    expect(manifest.yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState).toEqual({
      rustLiveHandlerEnabled: false,
      skillMappingEnabled: false,
      productionBindingEnabled: false,
      defaultLiveSmokeEnabled: false,
    })
    expect(manifest.releaseNotes.knownLimitations).toContain(
      "Yeonjang browser.active_tab_info release gate: blocked",
    )
    expect(manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness).toMatchObject({
      schemaVersion: "yeonjang-browser-active-tab-info-evidence-completeness-v1",
      visibility: "release_summary",
      missingSourceCount: REQUIRED_SOURCE_COUNT,
      missingTestCount: REQUIRED_TEST_COUNT,
      staleTestCount: 0,
      rejectedSkippedTestCount: 0,
      rejectedUnknownTestCount: 0,
      rejectedPublicRawReportCount: 0,
      failingTestCount: REQUIRED_TEST_COUNT,
    })
    expect(manifest.releaseNotes.knownLimitations).toContain(
      `Yeonjang browser.active_tab_info evidence completeness: missingSources=${REQUIRED_SOURCE_COUNT}, missingTests=${REQUIRED_TEST_COUNT}, staleTests=0, rejectedSkipped=0, rejectedUnknown=0, rejectedPublicRawReports=0.`,
    )
  })

  it("uses explicit repository evidence input without direct release-domain filesystem lookup", () => {
    const existingPaths = new Set(
      ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.flatMap((requirement) => [
        requirement.modulePath,
        requirement.testPath,
      ]),
    )
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T00:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateRepositoryEvidence: {
        evidencePort: {
          existsFile(relativePath) {
            return existingPaths.has(relativePath)
          },
          getTestStatus(testPath) {
            return existingPaths.has(testPath) ? "passed" : "missing"
          },
        },
      },
    })

    expect(manifest.yeonjangBrowserActiveTabInfoReleaseGate.gateStatus).toBe(
      "ready_for_manual_live_integration_review",
    )
    expect(manifest.yeonjangBrowserActiveTabInfoReleaseGate.liveIntegrationState).toEqual({
      rustLiveHandlerEnabled: false,
      skillMappingEnabled: false,
      productionBindingEnabled: false,
      defaultLiveSmokeEnabled: false,
    })
    expect(manifest.releaseNotes.knownLimitations).toContain(
      "Yeonjang browser.active_tab_info release gate: ready_for_manual_live_integration_review",
    )
    expect(manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness).toMatchObject({
      missingSourceCount: 0,
      missingTestCount: 0,
      staleTestCount: 0,
      rejectedSkippedTestCount: 0,
      rejectedUnknownTestCount: 0,
      rejectedPublicRawReportCount: 0,
      failingTestCount: 0,
    })
  })

  it("keeps explicit fixture evidence separate from repository evidence input", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T00:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
    })

    expect(manifest.yeonjangBrowserActiveTabInfoReleaseGate.gateStatus).toBe(
      "ready_for_manual_live_integration_review",
    )
  })

  it("keeps active tab info evidence completeness details sanitized for audit use", () => {
    const missingPath = "tests/task216-yeonjang-browser-active-tab-info-review-ready-bundle.test.ts"
    const existingPaths = new Set(
      ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS
        .flatMap((requirement) => [requirement.modulePath, requirement.testPath])
        .filter((path) => path !== missingPath),
    )
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T00:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateRepositoryEvidence: {
        evidencePort: {
          existsFile(relativePath) {
            return existingPaths.has(relativePath)
          },
          getTestStatus(testPath) {
            return existingPaths.has(testPath) ? "passed" : "missing"
          },
        },
      },
    })

    expect(manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness).toMatchObject({
      visibility: "release_summary",
      missingSourceCount: 0,
      missingTestCount: 1,
      failingTestCount: 1,
      auditDetailVisibility: "audit_only",
      auditDetailPaths: {
        missingSourcePaths: [],
        missingTestPaths: [missingPath],
        staleTestPaths: [],
        rejectedSkippedTestPaths: [],
        rejectedUnknownTestPaths: [],
        rejectedPublicRawReportPaths: [],
        failingTestPaths: [missingPath],
      },
    })
    const serialized = JSON.stringify(manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness)
    expect(serialized).not.toContain(process.cwd())
    expect(serialized).not.toMatch(/stdout|stderr|stack trace|raw output|https?:\/\//iu)
    expect(manifest.releaseNotes.knownLimitations).toContain(
      "Yeonjang browser.active_tab_info evidence completeness: missingSources=0, missingTests=1, staleTests=0, rejectedSkipped=0, rejectedUnknown=0, rejectedPublicRawReports=0.",
    )
  })

  it("blocks release readiness when active tab info gate or evidence completeness is not clean", () => {
    const missingEvidenceManifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T00:00:00.000Z"),
    })

    expect(evaluateReleaseReadiness(missingEvidenceManifest).blockerCodes).toContain(
      "yeonjang_active_tab_info_release_gate_failed",
    )

    const completeManifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T00:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
    })

    expect(evaluateReleaseReadiness(completeManifest).blockerCodes).not.toContain(
      "yeonjang_active_tab_info_release_gate_failed",
    )
  })

  it("adds sanitized active tab info evidence counts to publication write failures", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T00:00:00.000Z"),
    })

    expect(() =>
      writePreparedReleasePackage({
        manifest,
        outputDir: "/tmp/knowbee-active-tab-info-blocked-output",
        copyPayload: false,
      }),
    ).toThrow(
      /Yeonjang browser\.active_tab_info evidence blocked: missingSources=\d+, missingTests=\d+, staleTests=0, rejectedSkipped=0, rejectedUnknown=0, rejectedPublicRawReports=0, failingTests=\d+\./u,
    )
  })

  it("writes active tab info sanitized audit evidence as a checksummed package artifact", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "knowbee-active-tab-info-audit-"))
    try {
      const manifest = buildReleaseManifest({
        rootDir: process.cwd(),
        now: new Date("2026-07-22T00:00:00.000Z"),
        yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
      })
      makeActiveTabInfoOnlyReadyForWrite(manifest)
      const result = writePreparedReleasePackage({ manifest, outputDir, copyPayload: true })
      const artifact = result.manifest.yeonjangBrowserActiveTabInfoAuditArtifact
      const auditPath = join(outputDir, "payload", ...artifact.packagePath.split("/"))
      const auditContent = readFileSync(auditPath, "utf8")
      const auditJson = JSON.parse(auditContent) as {
        schemaVersion: string
        visibility: string
        rawDataAllowed: boolean
        evidenceCompleteness: unknown
      }

      expect(artifact).toMatchObject({
        id: "yeonjang:browser-active-tab-info:evidence",
        kind: "active_tab_info_audit_bundle",
        packagePath: "audit/yeonjang/browser-active-tab-info-evidence.json",
        audience: "audit_only",
        redaction: "sanitized",
        rawDataAllowed: false,
      })
      expect(existsSync(auditPath)).toBe(true)
      expect(auditJson).toMatchObject({
        schemaVersion: "yeonjang-browser-active-tab-info-audit-artifact-v1",
        visibility: "audit_only",
        rawDataAllowed: false,
        evidenceCompleteness: result.manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness,
      })
      expect(createHash("sha256").update(auditContent).digest("hex")).toBe(artifact.checksum)
      expect(result.manifest.checksums).toContainEqual({
        id: artifact.id,
        checksum: artifact.checksum,
        packagePath: artifact.packagePath,
      })
      expect(result.activeTabInfoAuditVerification).toEqual({
        status: "verified",
        visibility: "audit_operator_summary",
        summary: {
          artifactId: artifact.id,
          checksum: artifact.checksum,
          packagePath: artifact.packagePath,
          evidenceCountSummary: {
            missingSourceCount: 0,
            missingTestCount: 0,
            staleTestCount: 0,
            rejectedSkippedTestCount: 0,
            rejectedUnknownTestCount: 0,
            rejectedPublicRawReportCount: 0,
            failingTestCount: 0,
          },
        },
      })
      expect(result.copiedArtifacts).toEqual(
        expect.arrayContaining([
          {
            id: artifact.id,
            sourcePath: "[generated:release-manifest]",
            targetPath: auditPath,
          },
        ]),
      )
      expect(auditContent).not.toMatch(/stdout|stderr|stack trace|raw output|https?:\/\/|token=|window-private|tab-private/iu)
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })

  it("projects active tab info audit artifact evidence for release approval without audit detail paths", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T00:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
    })
    const readiness = evaluateReleaseReadiness(manifest)
    const projection = buildReleaseApprovalEvidenceProjection({ manifest, readiness })
    const serialized = JSON.stringify(projection)

    expect(projection).toMatchObject({
      schemaVersion: "knowbee.release-approval-evidence.v1",
      visibility: "release_operator_summary",
      readiness: {
        status: readiness.status,
        blockerCodes: readiness.blockerCodes,
      },
      activeTabInfoAuditArtifact: {
        id: manifest.yeonjangBrowserActiveTabInfoAuditArtifact.id,
        checksum: manifest.yeonjangBrowserActiveTabInfoAuditArtifact.checksum,
        packagePath: manifest.yeonjangBrowserActiveTabInfoAuditArtifact.packagePath,
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
    })
    expect(serialized).not.toMatch(
      /auditDetailPaths|missingSourcePaths|missingTestPaths|stdout|stderr|stack trace|raw output|https?:\/\/|\/Users\/|\/private\//iu,
    )
  })
})
