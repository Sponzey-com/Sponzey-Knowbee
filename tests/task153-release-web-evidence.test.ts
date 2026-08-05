import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import type { WebRetrievalLiveSmokeSummary } from "../packages/core/src/runs/web-retrieval-smoke.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const NOW = Date.parse("2026-07-17T04:00:00.000Z")
const SOURCE_REF = `tool-result:web:${"c".repeat(64)}`
const TARGET_FINGERPRINT = `sha256:${"a".repeat(64)}` as const

beforeEach(() => closeDb())

function liveRun(): WebRetrievalLiveSmokeSummary {
  return {
    kind: "web_retrieval.live_smoke",
    mode: "live-run",
    smokeId: "web-smoke:release-153",
    policyVersion: "web-evidence-llm-diagnosis-v2",
    startedAt: "2026-07-17T03:58:00.000Z",
    finishedAt: "2026-07-17T04:00:00.000Z",
    status: "passed",
    counts: { total: 1, passed: 1, failed: 0, skipped: 0 },
    results: [
      {
        scenario: {
          id: "current-fact",
          title: "Current fact",
          request: "private request",
          target: { canonicalName: "private target" },
          freshnessPolicy: "latest_approximate",
          minimumMethods: ["direct_fetch"],
          completionConditions: ["current target and time verified"],
        },
        status: "passed",
        failures: [],
        trace: {
          attemptedMethods: ["direct_fetch"],
          answerProduced: true,
          resultDiagnosis: {
            diagnosedBy: "llm",
            status: "complete",
            contextFingerprint: `sha256:${"b".repeat(64)}`,
            criterionKeys: ["existence", "accuracy", "freshness", "target_match"],
            conditionCount: 1,
            evidenceRefs: [SOURCE_REF],
          },
          liveAcceptance: {
            auditEventId: "audit:web:release-153",
            redactionStatus: "verified",
            targetBinding: {
              status: "verified",
              requestedTargetFingerprint: TARGET_FINGERPRINT,
              evidenceTargetFingerprint: TARGET_FINGERPRINT,
            },
            sourceEvidence: [
              {
                evidenceRef: SOURCE_REF,
                sourceDomain: "quote.example",
                sourceTimestamp: "2026-07-17T03:59:00.000Z",
                fetchedAt: "2026-07-17T03:59:05.000Z",
              },
            ],
          },
          finalText: "private answer",
        },
        startedAt: "2026-07-17T03:58:00.000Z",
        finishedAt: "2026-07-17T04:00:00.000Z",
      },
    ],
  }
}

describe("Task 153 release Web evidence integration", () => {
  it("admits verified Web live evidence and stores only a bounded production summary", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task153-release-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["web"],
        webLiveSmokeRuns: [liveRun()],
        webLiveSourceMaxAgeMs: 5 * 60 * 1_000,
        now: new Date(NOW),
        liveAcceptanceMaxAgeMs: 1_000,
      })
      expect(manifest.liveAcceptance).toMatchObject({
        status: "admitted",
        acceptedEvidenceRefs: ["web-smoke:web-smoke:release-153:current-fact"],
      })
      expect(manifest.webLiveAcceptanceProduction).toEqual({ acceptedCount: 1, rejected: [] })
      expect(JSON.stringify(manifest.webLiveAcceptanceProduction)).not.toMatch(
        /private|quote\.example|sourceTimestamp|resultDiagnosis|finalText/u,
      )
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  it("keeps dry-run Web evidence blocked with a bounded reason", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task153-dry-run-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const input = liveRun()
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["web"],
        webLiveSmokeRuns: [{ ...input, mode: "dry-run" }],
        webLiveSourceMaxAgeMs: 5 * 60 * 1_000,
        now: new Date(NOW),
        liveAcceptanceMaxAgeMs: 1_000,
      })
      expect(manifest.liveAcceptance.status).toBe("blocked")
      expect(manifest.webLiveAcceptanceProduction).toEqual({
        acceptedCount: 0,
        rejected: [{ scenarioId: "current-fact", reasonCode: "web_smoke_not_live" }],
      })
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  it("does not let an older accepted receipt hide the latest failed scenario", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task153-latest-failed-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const accepted = liveRun()
      const latestResult = accepted.results[0]
      if (!latestResult) throw new Error("missing Task 153 live result fixture")
      const latestFailed: WebRetrievalLiveSmokeSummary = {
        ...accepted,
        smokeId: "web-smoke:release-153-latest",
        finishedAt: "2026-07-17T04:00:00.500Z",
        status: "failed",
        counts: { total: 1, passed: 0, failed: 1, skipped: 0 },
        results: [{ ...latestResult, status: "failed", failures: ["latest verification failed"] }],
      }
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["web"],
        webLiveSmokeRuns: [accepted, latestFailed],
        webLiveSourceMaxAgeMs: 5 * 60 * 1_000,
        now: new Date(NOW + 1_000),
        liveAcceptanceMaxAgeMs: 5_000,
      })
      expect(manifest.liveAcceptance.status).toBe("blocked")
      expect(manifest.webLiveAcceptanceProduction.acceptedCount).toBe(0)
      expect(manifest.webLiveAcceptanceProduction.rejected).toContainEqual({
        scenarioId: "current-fact",
        reasonCode: "web_smoke_run_not_passed",
      })
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})
