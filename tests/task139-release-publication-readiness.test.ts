import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { closeDb } from "../packages/core/src/db/index.js"
import {
  type ReleaseManifest,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  writePreparedReleasePackage,
} from "../packages/core/src/release/package.js"
import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-evidence-collector.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.js"

const tempDirs: string[] = []

function fixtureManifest(): ReleaseManifest {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task139-manifest-"))
  tempDirs.push(root)
  const runtime = createTestRuntimeConfigFixture({ rootDir: root })
  const manifest = buildReleaseManifest({
    rootDir: root,
    runtimePaths: runtime.paths,
    targetPlatforms: [],
    now: new Date("2026-07-17T00:00:00.000Z"),
    yeonjangBrowserActiveTabInfoReleaseGateEvidence: {
      moduleEvidence: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
        gateId: requirement.gateId,
        present: true,
      })),
      testEvidence: ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
        testPath: requirement.testPath,
        status: "passed",
      })),
    },
  })
  manifest.requiredMissing = []
  manifest.updatePreflight.ok = true
  manifest.updatePreflight.checks = manifest.updatePreflight.checks.map((check) => ({
    ...check,
    ok: true,
  }))
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
    kind: "knowbee.release.operational_rehearsal_evidence",
    schemaVersion: 1,
    status: "passed",
    reasonCodes: [],
    npmInstall: {
      status: "verified",
      reasonCode: null,
      packageVersion: manifest.appVersion,
      packageSetDigestSha256: "a".repeat(64),
    },
    backupRestore: {
      status: "verified",
      reasonCode: null,
      snapshotId: "snapshot:task139",
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
  return manifest
}

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task139 release publication readiness", () => {
  it("returns stable ordered blocker codes for every required release boundary", () => {
    const manifest = fixtureManifest()
    manifest.requiredMissing = ["gateway:core"]
    manifest.updatePreflight.ok = false
    manifest.migrationPreflight.ok = false
    manifest.performanceEvidence.gateStatus = "failed"
    manifest.benchmarkEvidence.gateStatus = "failed"
    manifest.subAgentReleaseGate.gateStatus = "failed"
    manifest.enterpriseTopologyReleaseGate.gateStatus = "failed"
    manifest.orchestrationEvidence.gateStatus = "failed"
    manifest.webRetrievalEvidence.gateStatus = "failed"
    manifest.uiModeEvidence.gateStatus = "failed"
    manifest.yeonjangMultiInstanceEvidence.gateStatus = "failed"
    manifest.memoryCompactionEvidence.gateStatus = "failed"
    manifest.liveAcceptance = {
      status: "blocked",
      reasonCodes: ["live_evidence_missing"],
      acceptedEvidenceRefs: [],
    }

    expect(evaluateReleaseReadiness(manifest)).toEqual({
      status: "blocked",
      blockerCodes: [
        "required_artifact_missing",
        "update_preflight_failed",
        "migration_preflight_failed",
        "performance_gate_failed",
        "benchmark_gate_failed",
        "sub_agent_gate_failed",
        "enterprise_topology_gate_failed",
        "orchestration_gate_failed",
        "web_retrieval_gate_failed",
        "ui_mode_gate_failed",
        "yeonjang_multi_instance_gate_failed",
        "memory_compaction_gate_failed",
        "live_acceptance_failed",
      ],
    })
  })

  it("accepts warning-only optional evidence and blocks writes before creating output", () => {
    const ready = fixtureManifest()
    ready.webRetrievalEvidence.gateStatus = "warning"
    ready.uiModeEvidence.gateStatus = "warning"
    expect(evaluateReleaseReadiness(ready)).toEqual({ status: "ready", blockerCodes: [] })

    const blocked = structuredClone(ready)
    blocked.performanceEvidence.gateStatus = "failed"
    const outputDir = join(tempDirs[0] ?? tmpdir(), "blocked-output")
    expect(() =>
      writePreparedReleasePackage({ manifest: blocked, outputDir, copyPayload: false }),
    ).toThrow("performance_gate_failed")
    expect(existsSync(outputDir)).toBe(false)
  })

  it("reports bounded dry-run readiness without writing package files", () => {
    const directory = mkdtempSync(join(tmpdir(), "knowbee-task139-cli-"))
    tempDirs.push(directory)
    const outputDir = join(directory, "release")
    const command = spawnSync(
      process.execPath,
      [
        resolve("scripts/release-package.mjs"),
        "--dry-run",
        "--json",
        "--no-copy",
        "--output-dir",
        outputDir,
      ],
      {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, KNOWBEE_STATE_DIR: join(directory, "state") },
      },
    )

    expect(command.status, command.stderr).toBe(0)
    const result = JSON.parse(command.stdout) as {
      dryRun: boolean
      readiness: { status: string; blockerCodes: string[] }
      readinessFailureSummary: { visibility: string; lines: string[] }
      releaseApprovalEvidence: {
        schemaVersion: string
        visibility: string
        readiness: { status: string; blockerCodes: string[] }
        activeTabInfoAuditArtifact: { id: string; checksum: string; packagePath: string }
        activeTabInfoEvidenceCompleteness: Record<string, number>
      }
      activeTabInfoAuditAccessProjection: {
        schemaVersion: string
        method: string
        entries: Array<{
          surface: string
          audience: string
          visibility: string
          rawDataAllowed: boolean
          auditDetailPathsIncluded: boolean
          activeTabInfoAuditArtifact: { id: string; checksum: string; packagePath: string }
          evidenceCountSummary: Record<string, number>
        }>
      }
      activeTabInfoAuditVerification: {
        status: string
        visibility: string
        reasonCode: string
        summary: {
          artifactId: string
          checksum: string
          packagePath: string
          evidenceCountSummary: Record<string, number>
        }
      }
      copiedArtifacts: unknown[]
    }
    expect(result).toMatchObject({
      dryRun: true,
      readiness: { status: "blocked" },
      copiedArtifacts: [],
    })
    expect(result.readiness.blockerCodes).toContain("performance_gate_failed")
    expect(result.readinessFailureSummary).toMatchObject({
      visibility: "release_operator_summary",
      lines: expect.arrayContaining([
        expect.stringMatching(
          /Yeonjang browser\.active_tab_info evidence blocked: missingSources=\d+, missingTests=\d+, staleTests=0, rejectedSkipped=0, rejectedUnknown=0, rejectedPublicRawReports=0, failingTests=\d+\./u,
        ),
      ]),
    })
    expect(result.releaseApprovalEvidence).toMatchObject({
      schemaVersion: "knowbee.release-approval-evidence.v1",
      visibility: "release_operator_summary",
      readiness: {
        status: result.readiness.status,
        blockerCodes: result.readiness.blockerCodes,
      },
      activeTabInfoAuditArtifact: {
        id: "yeonjang:browser-active-tab-info:evidence",
        packagePath: "audit/yeonjang/browser-active-tab-info-evidence.json",
      },
      activeTabInfoEvidenceCompleteness: {
        staleTestCount: 0,
        rejectedSkippedTestCount: 0,
        rejectedUnknownTestCount: 0,
        rejectedPublicRawReportCount: 0,
      },
    })
    expect(result.releaseApprovalEvidence.activeTabInfoAuditArtifact.checksum).toMatch(
      /^[a-f0-9]{64}$/u,
    )
    expect(JSON.stringify(result.readinessFailureSummary)).not.toMatch(
      /stdout|stderr|stack trace|raw output|https?:\/\//iu,
    )
    expect(JSON.stringify(result.releaseApprovalEvidence)).not.toMatch(
      /auditDetailPaths|missingSourcePaths|missingTestPaths|stdout|stderr|stack trace|raw output|https?:\/\/|\/Users\/|\/private\//iu,
    )
    expect(result.activeTabInfoAuditAccessProjection).toMatchObject({
      schemaVersion: "knowbee.active-tab-info-audit-access-projection.v1",
      method: "browser.active_tab_info",
    })
    expect(result.activeTabInfoAuditAccessProjection.entries.map((entry) => entry.surface)).toEqual([
      "release_summary",
      "release_package_dry_run_json",
      "release_approval_cli_output",
      "release_prepared_candidate_cli_output",
      "release_manifest_public_fields",
      "audit_artifact_descriptor",
      "audit_artifact_payload",
    ])
    const publicProjectionEntries = result.activeTabInfoAuditAccessProjection.entries.filter(
      (entry) => entry.audience === "release_operator",
    )
    expect(publicProjectionEntries).toHaveLength(5)
    for (const entry of publicProjectionEntries) {
      expect(entry.rawDataAllowed).toBe(false)
      expect(entry.auditDetailPathsIncluded).toBe(false)
      expect(entry.activeTabInfoAuditArtifact.packagePath).toBe(
        "audit/yeonjang/browser-active-tab-info-evidence.json",
      )
      expect(entry.evidenceCountSummary).toMatchObject({
        rejectedSkippedTestCount: 0,
        rejectedUnknownTestCount: 0,
        rejectedPublicRawReportCount: 0,
      })
    }
    expect(
      result.activeTabInfoAuditAccessProjection.entries.find(
        (entry) => entry.surface === "audit_artifact_payload",
      ),
    ).toMatchObject({
      audience: "audit_operator",
      visibility: "audit_only",
      rawDataAllowed: false,
      auditDetailPathsIncluded: true,
    })
    expect(JSON.stringify(result.activeTabInfoAuditAccessProjection)).not.toMatch(
      /missingSourcePaths|missingTestPaths|staleTestPaths|rejectedSkippedTestPaths|rejectedUnknownTestPaths|rejectedPublicRawReportPaths|failingTestPaths|https?:\/\/|\/Users\/|\/private\//iu,
    )
    expect(result.activeTabInfoAuditVerification).toMatchObject({
      status: "pending",
      visibility: "release_operator_summary",
      reasonCode: "active_tab_info_audit_artifact_payload_not_written",
      summary: {
        artifactId: "yeonjang:browser-active-tab-info:evidence",
        packagePath: "audit/yeonjang/browser-active-tab-info-evidence.json",
      },
    })
    expect(result.activeTabInfoAuditVerification.summary.checksum).toMatch(/^[a-f0-9]{64}$/u)
    expect(JSON.stringify(result.activeTabInfoAuditVerification)).not.toMatch(
      /missingSourcePaths|missingTestPaths|stdout|stderr|stack trace|raw output|https?:\/\/|\/Users\/|\/private\//iu,
    )
    expect(existsSync(outputDir)).toBe(false)
    expect(command.stdout).not.toMatch(/promptBundle|rawEvidence|SECRET_/)

    const publicationOutput = join(directory, "publication")
    const publication = spawnSync(
      process.execPath,
      [resolve("scripts/release-package.mjs"), "--no-copy", "--output-dir", publicationOutput],
      {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, KNOWBEE_STATE_DIR: join(directory, "state") },
      },
    )
    expect(publication.status).not.toBe(0)
    expect(publication.stderr).toContain("Release readiness blocked")
    expect(publication.stderr).toContain("performance_gate_failed")
    expect(publication.stderr).toContain("Yeonjang browser.active_tab_info evidence blocked")
    expect(existsSync(publicationOutput)).toBe(false)
  })
})
