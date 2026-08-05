import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.ts"
import {
  buildReleaseManifest,
  buildReleasePipelinePlan,
  evaluateReleaseReadiness,
} from "../packages/core/src/release/package.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

describe("Task 151 release live gate integration", () => {
  it("makes live acceptance required for public releases and explicit for internal builds", () => {
    const publicStep = buildReleasePipelinePlan({ audience: "public" }).steps.find(
      (step) => step.id === "live-smoke-gate",
    )
    const internalStep = buildReleasePipelinePlan({ audience: "internal" }).steps.find(
      (step) => step.id === "live-smoke-gate",
    )
    expect(publicStep).toMatchObject({ required: true, smoke: true })
    expect(internalStep).toMatchObject({ required: false, smoke: true })
  })

  it("keeps admission policy independent from environment, providers, DB, and filesystem", () => {
    const source = readFileSync(
      new URL("../packages/core/src/release/live-acceptance-admission.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(/process\.env|node:fs|db\/|channels\/|provider|fetch\(/u)
  })

  it("stores the bounded admission summary and blocks public readiness without evidence", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task151-release-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["telegram"],
        now: new Date("2026-07-17T04:00:00.000Z"),
      })
      expect(manifest.liveAcceptance).toEqual({
        status: "blocked",
        reasonCodes: ["live_evidence_missing"],
        acceptedEvidenceRefs: [],
      })
      expect(evaluateReleaseReadiness(manifest).blockerCodes).toContain("live_acceptance_failed")
      expect(JSON.stringify(manifest.liveAcceptance)).not.toMatch(/token|target|prompt|response/u)
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})
