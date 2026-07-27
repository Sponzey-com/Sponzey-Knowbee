import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import type { YeonjangLiveSmokeSummary } from "../packages/core/src/runs/yeonjang-live-smoke.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const NOW = Date.parse("2026-07-17T06:00:00.000Z")
const EVIDENCE_REF = `tool-result:yeonjang:${"b".repeat(64)}`

beforeEach(() => closeDb())

function run(runId = "yeonjang-run:release-155", finishedAt = NOW): YeonjangLiveSmokeSummary {
  return {
    kind: "yeonjang.live_smoke",
    mode: "live-run",
    runId,
    status: "passed",
    startedAt: finishedAt - 2_000,
    finishedAt,
    results: [
      {
        scenario: {
          id: "office-mac-status",
          expectedInstanceId: "instance:office-mac",
          expectedSessionId: "session:office-mac:1",
          expectedMethod: "system.info",
          readOnly: true,
        },
        state: "verified",
        status: "passed",
        trace: {
          requestGroupId: runId,
          instance: {
            instanceId: "instance:office-mac",
            publicName: "Office Mac",
            sessionId: "session:office-mac:1",
            status: "connected",
            observedAt: finishedAt - 500,
            duplicateActiveIdentityCount: 0,
            trustState: "trusted",
            runnableTarget: true,
          },
          command: {
            runId,
            requestGroupId: runId,
            commandId: `command:${runId}`,
            instanceId: "instance:office-mac",
            sessionId: "session:office-mac:1",
            method: "system.info",
            readOnly: true,
            deliveryStatus: "acked",
          },
          observedResult: {
            runId,
            commandId: `command:${runId}`,
            instanceId: "instance:office-mac",
            sessionId: "session:office-mac:1",
            status: "observed",
            evidenceRef: EVIDENCE_REF,
          },
          resultDiagnosis: {
            diagnosedBy: "llm",
            status: "complete",
            contextFingerprint: `sha256:${"a".repeat(64)}`,
            criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
            evidenceRefs: [EVIDENCE_REF],
          },
          auditEventId: "audit:yeonjang:155",
          redactionStatus: "verified",
        },
        startedAt: finishedAt - 1_000,
        finishedAt,
      },
    ],
  }
}

describe("Task 155 release Yeonjang evidence integration", () => {
  it("admits verified Yeonjang evidence and stores only bounded production data", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task155-release-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["yeonjang"],
        yeonjangLiveSmokeRuns: [run()],
        yeonjangLiveSessionMaxAgeMs: 5_000,
        now: new Date(NOW),
        liveAcceptanceMaxAgeMs: 1_000,
      })
      expect(manifest.liveAcceptance).toMatchObject({
        status: "admitted",
        acceptedEvidenceRefs: ["yeonjang-smoke:yeonjang-run:release-155:office-mac-status"],
      })
      expect(manifest.yeonjangLiveAcceptanceProduction).toEqual({ acceptedCount: 1, rejected: [] })
      expect(JSON.stringify(manifest.yeonjangLiveAcceptanceProduction)).not.toMatch(
        /office|session|command|tool-result|contextFingerprint/u,
      )
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  it("blocks an ACK-only receipt with a bounded reason", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task155-ack-only-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const input = run()
      const item = input.results[0]
      if (!item?.trace) throw new Error("missing Task 155 trace fixture")
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["yeonjang"],
        yeonjangLiveSmokeRuns: [
          { ...input, results: [{ ...item, trace: { ...item.trace, observedResult: null } }] },
        ],
        now: new Date(NOW),
      })
      expect(manifest.liveAcceptance.status).toBe("blocked")
      expect(manifest.yeonjangLiveAcceptanceProduction).toEqual({
        acceptedCount: 0,
        rejected: [
          { scenarioId: "office-mac-status", reasonCode: "yeonjang_smoke_observed_result_missing" },
        ],
      })
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  it("does not let an older success hide the latest failed scenario", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task155-latest-failed-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const old = run("yeonjang-run:old", NOW - 1_000)
      const latest = run("yeonjang-run:latest", NOW)
      const item = latest.results[0]
      if (!item) throw new Error("missing Task 155 result fixture")
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        targetPlatforms: [],
        requiredLiveCapabilities: ["yeonjang"],
        yeonjangLiveSmokeRuns: [
          old,
          {
            ...latest,
            status: "failed",
            results: [{ ...item, state: "rejected", status: "failed" }],
          },
        ],
        now: new Date(NOW),
        liveAcceptanceMaxAgeMs: 5_000,
      })
      expect(manifest.liveAcceptance.status).toBe("blocked")
      expect(manifest.yeonjangLiveAcceptanceProduction.acceptedCount).toBe(0)
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})
