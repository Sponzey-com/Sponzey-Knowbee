import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  buildReleaseManifest,
  verifyReleaseActiveTabInfoAuditArtifactPayload,
  writePreparedReleasePackage,
} from "../packages/core/src/release/package.ts"
import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-evidence-collector.ts"

const require = createRequire(import.meta.url)

function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex")
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

describe("task225 release active tab info audit artifact verifier", () => {
  it("verifies generated audit payload by checksum and sanitized completeness summary", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "knowbee-active-tab-info-audit-verify-"))
    try {
      const manifest = buildReleaseManifest({
        rootDir: process.cwd(),
        now: new Date("2026-07-22T00:00:00.000Z"),
        yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
      })
      makeActiveTabInfoOnlyReadyForWrite(manifest)
      const result = writePreparedReleasePackage({ manifest, outputDir, copyPayload: true })
      const artifact = result.manifest.yeonjangBrowserActiveTabInfoAuditArtifact
      const payloadPath = join(outputDir, "payload", ...artifact.packagePath.split("/"))
      const payloadContent = readFileSync(payloadPath, "utf8")

      const verification = verifyReleaseActiveTabInfoAuditArtifactPayload({
        artifact,
        payloadContent,
      })

      expect(verification).toEqual({
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
      expect(JSON.stringify(verification)).not.toMatch(
        /missingSourcePaths|missingTestPaths|stdout|stderr|stack trace|raw output|https?:\/\/|\/Users\/|\/private\//iu,
      )
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })

  it("rejects checksum mismatch, raw data, and unsafe audit detail paths without returning payload data", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T00:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
    })
    const artifact = manifest.yeonjangBrowserActiveTabInfoAuditArtifact
    const cleanPayload = {
      schemaVersion: "yeonjang-browser-active-tab-info-audit-artifact-v1",
      method: "browser.active_tab_info",
      visibility: "audit_only",
      rawDataAllowed: false,
      evidenceCompleteness: manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness,
    }
    const cleanContent = `${JSON.stringify(cleanPayload, null, 2)}\n`
    const rawContent = `${JSON.stringify(
      {
        ...cleanPayload,
        rawRunnerData: { stdout: "raw output", url: "https://internal.example" },
      },
      null,
      2,
    )}\n`
    const unsafePathContent = `${JSON.stringify(
      {
        ...cleanPayload,
        evidenceCompleteness: {
          ...manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness,
          auditDetailPaths: {
            ...manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness.auditDetailPaths,
            missingTestPaths: ["../unsafe/test.ts"],
          },
        },
      },
      null,
      2,
    )}\n`

    const checksumMismatch = verifyReleaseActiveTabInfoAuditArtifactPayload({
      artifact,
      payloadContent: cleanContent.replace("audit_only", "audit-only"),
    })
    const rawRejected = verifyReleaseActiveTabInfoAuditArtifactPayload({
      artifact: { ...artifact, checksum: checksum(rawContent) },
      payloadContent: rawContent,
    })
    const unsafePathRejected = verifyReleaseActiveTabInfoAuditArtifactPayload({
      artifact: { ...artifact, checksum: checksum(unsafePathContent) },
      payloadContent: unsafePathContent,
    })

    expect(checksumMismatch).toEqual({
      status: "rejected",
      visibility: "audit_operator_summary",
      reasonCode: "active_tab_info_audit_artifact_checksum_mismatch",
    })
    expect(rawRejected).toEqual({
      status: "rejected",
      visibility: "audit_operator_summary",
      reasonCode: "active_tab_info_audit_artifact_raw_data_detected",
    })
    expect(unsafePathRejected).toEqual({
      status: "rejected",
      visibility: "audit_operator_summary",
      reasonCode: "active_tab_info_audit_artifact_detail_path_unsafe",
    })
    expect(JSON.stringify([checksumMismatch, rawRejected, unsafePathRejected])).not.toMatch(
      /raw output|https?:\/\/|\/Users\/|\/private\/|\.\.\/unsafe/iu,
    )
  })

  it("exposes a CLI verifier with sanitized success summaries and reason-code failures", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "knowbee-active-tab-info-audit-cli-"))
    try {
      const manifest = buildReleaseManifest({
        rootDir: process.cwd(),
        now: new Date("2026-07-22T00:00:00.000Z"),
        yeonjangBrowserActiveTabInfoReleaseGateEvidence: completeActiveTabInfoEvidence(),
      })
      makeActiveTabInfoOnlyReadyForWrite(manifest)
      const result = writePreparedReleasePackage({ manifest, outputDir, copyPayload: true })
      const artifact = result.manifest.yeonjangBrowserActiveTabInfoAuditArtifact
      const payloadPath = join(outputDir, "payload", ...artifact.packagePath.split("/"))
      const rawPayloadPath = join(outputDir, "payload", "raw-active-tab-info-audit.json")
      const rawPayload = `${JSON.stringify(
        {
          schemaVersion: "yeonjang-browser-active-tab-info-audit-artifact-v1",
          method: "browser.active_tab_info",
          visibility: "audit_only",
          rawDataAllowed: false,
          rawRunnerData: { stderr: "raw output", url: "https://internal.example" },
          evidenceCompleteness: result.manifest.yeonjangBrowserActiveTabInfoEvidenceCompleteness,
        },
        null,
        2,
      )}\n`
      writeFileSync(rawPayloadPath, rawPayload, "utf8")
      const rawManifestPath = join(outputDir, "raw-manifest.json")
      writeFileSync(
        rawManifestPath,
        JSON.stringify(
          {
            ...result.manifest,
            yeonjangBrowserActiveTabInfoAuditArtifact: {
              ...artifact,
              checksum: checksum(rawPayload),
            },
          },
          null,
          2,
        ),
        "utf8",
      )

      const success = spawnSync(
        process.execPath,
        [
          resolve("scripts/self/verify-active-tab-info-audit-artifact.mjs"),
          "--manifest",
          result.manifestPath,
          "--payload",
          payloadPath,
        ],
        { cwd: resolve("."), encoding: "utf8" },
      )
      const rejected = spawnSync(
        process.execPath,
        [
          resolve("scripts/self/verify-active-tab-info-audit-artifact.mjs"),
          "--manifest",
          rawManifestPath,
          "--payload",
          rawPayloadPath,
        ],
        { cwd: resolve("."), encoding: "utf8" },
      )

      expect(success.status, success.stderr).toBe(0)
      expect(success.stdout).toContain("Active tab info audit artifact verified:")
      expect(success.stdout).toContain(`artifact=${artifact.id}`)
      expect(success.stdout).toContain(`checksum=${artifact.checksum}`)
      expect(success.stdout).toContain(`packagePath=${artifact.packagePath}`)
      expect(success.stdout).toContain(
        "counts=missingSources=0,missingTests=0,staleTests=0,rejectedSkipped=0,rejectedUnknown=0,rejectedPublicRawReports=0,failingTests=0",
      )
      expect(success.stdout).not.toMatch(
        /missingSourcePaths|missingTestPaths|stdout|stderr|stack trace|raw output|https?:\/\/|\/Users\/|\/private\//iu,
      )
      expect(rejected.status).not.toBe(0)
      expect(rejected.stderr.trim()).toBe("active_tab_info_audit_artifact_raw_data_detected")
      expect(`${rejected.stdout}${rejected.stderr}`).not.toMatch(
        /raw output|https?:\/\/|\/Users\/|\/private\//iu,
      )

      const packageJson = require("../package.json") as { scripts?: Record<string, string> }
      expect(packageJson.scripts?.["release:verify-active-tab-info-audit"]).toBe(
        "node scripts/self/verify-active-tab-info-audit-artifact.mjs",
      )
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })
})
