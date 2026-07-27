import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  type ReleaseManifest,
  writePreparedReleasePackage,
} from "../packages/core/src/release/package.ts"
import {
  evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-prerequisites.ts"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function forceReadyPrerequisites(manifest: ReleaseManifest): ReleaseManifest {
  return {
    ...manifest,
    yeonjangBrowserActiveTabInfoLiveEnablePrerequisites:
      evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites({
        productionExposureAuditPassed: true,
        manualReviewRecordAccepted: true,
        runtimeTransitionReady: true,
        releaseApprovalEvidenceValid: true,
        finalProductLogBoundaryReady: true,
        operatorWordingReady: true,
        taskEvidenceReady: true,
      }),
  }
}

describe("Task 238 release active tab info prerequisite readiness misuse guard", () => {
  it("does not let ready prerequisite projection clear release readiness blockers", () => {
    const manifest = forceReadyPrerequisites(buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T01:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: {
        moduleEvidence: [],
        testEvidence: [],
      },
    }))
    const readiness = evaluateReleaseReadiness(manifest)
    const approvalEvidence = buildReleaseApprovalEvidenceProjection({ manifest, readiness })
    const serialized = JSON.stringify(approvalEvidence)

    expect(manifest.yeonjangBrowserActiveTabInfoLiveEnablePrerequisites.status).toBe(
      "ready_for_explicit_enable_task",
    )
    expect(readiness.status).toBe("blocked")
    expect(readiness.blockerCodes).toContain("yeonjang_active_tab_info_release_gate_failed")
    expect(serialized).not.toContain("ready_for_explicit_enable_task")
    expect(serialized).not.toContain("yeonjangBrowserActiveTabInfoLiveEnablePrerequisites")
  })

  it("does not let ready prerequisite projection bypass publication write blockers", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "knowbee-prerequisite-misuse-"))
    tempDirs.push(outputDir)
    const manifest = forceReadyPrerequisites(buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T01:00:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: {
        moduleEvidence: [],
        testEvidence: [],
      },
    }))

    expect(() =>
      writePreparedReleasePackage({
        manifest,
        outputDir,
        copyPayload: false,
      }),
    ).toThrow(/yeonjang_active_tab_info_release_gate_failed|Yeonjang browser\.active_tab_info evidence blocked/u)
  })
})
