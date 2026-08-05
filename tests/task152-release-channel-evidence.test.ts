import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import type { PersistedChannelSmokeRunResult } from "../packages/core/src/channels/smoke-runner.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

beforeEach(() => closeDb())

function liveRun(): PersistedChannelSmokeRunResult {
  return {
    runId: "smoke-run-152",
    mode: "live-run",
    status: "passed",
    startedAt: 100,
    finishedAt: 200,
    summary: "private summary",
    counts: { total: 1, passed: 1, failed: 0, skipped: 0 },
    results: [
      {
        scenario: {
          id: "telegram.basic_query",
          channel: "telegram",
          kind: "basic_query",
          title: "Basic",
          request: "private request",
          expectedTarget: "telegram",
          correlationKey: "telegram_chat_thread",
          requiresExternalCredential: true,
          releaseGate: "automated",
        },
        status: "passed",
        failures: [],
        auditLogId: "audit-telegram-152",
        trace: {
          sourceChannel: "telegram",
          responseChannel: "telegram",
          requestFlow: {
            requestGroupMatchesRunId: true,
            decisionTracePresent: true,
            topologyRunCreated: true,
            providerDirectUsed: false,
          },
          auditLogId: "audit-telegram-152",
        },
        startedAt: 100,
        finishedAt: 200,
      },
    ],
  }
}

describe("Task 152 release channel evidence integration", () => {
  it("feeds accepted persisted evidence into admission and keeps only bounded rejection diagnostics", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task152-release-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["telegram"],
        channelLiveSmokeRuns: [liveRun()],
        now: new Date(200),
        liveAcceptanceMaxAgeMs: 1_000,
      })
      expect(manifest.liveAcceptance).toMatchObject({
        status: "admitted",
        acceptedEvidenceRefs: ["channel-smoke:smoke-run-152:telegram.basic_query"],
      })
      expect(manifest.channelLiveAcceptanceProduction).toEqual({ acceptedCount: 1, rejected: [] })
      expect(JSON.stringify(manifest.channelLiveAcceptanceProduction)).not.toMatch(
        /private|trace|request|summary/u,
      )
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  it("keeps rejected dry-run evidence blocked and bounded", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task152-rejected-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const input = liveRun()
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["telegram"],
        channelLiveSmokeRuns: [{ ...input, mode: "dry-run" }],
        now: new Date(200),
        liveAcceptanceMaxAgeMs: 1_000,
      })
      expect(manifest.liveAcceptance.status).toBe("blocked")
      expect(manifest.channelLiveAcceptanceProduction).toEqual({
        acceptedCount: 0,
        rejected: [{ scenarioId: "telegram.basic_query", reasonCode: "channel_smoke_not_live" }],
      })
      expect(JSON.stringify(manifest.channelLiveAcceptanceProduction)).not.toMatch(
        /private|trace|request|summary/u,
      )
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})
