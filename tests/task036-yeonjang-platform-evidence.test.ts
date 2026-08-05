import { describe, expect, it } from "vitest"
import { buildYeonjangPlatformAcceptanceMatrix } from "../packages/core/src/release/yeonjang-platform-acceptance.js"
import type { YeonjangLiveSmokeSummary } from "../packages/core/src/runs/yeonjang-live-smoke.js"

function liveRun(platform: "linux" | "windows" | "macos", status: "passed" | "failed") {
  const now = 1_000
  const scenario = {
    id: `${platform}-system-info`,
    expectedInstanceId: `${platform}:private`,
    expectedSessionId: `${platform}:session`,
    expectedMethod: "system.info" as const,
    readOnly: true as const,
  }
  return {
    platform,
    buildRevision: "revision-036",
    run: {
      kind: "yeonjang.live_smoke",
      mode: "live-run",
      runId: `run:${platform}`,
      status,
      startedAt: now,
      finishedAt: now,
      results: [
        {
          scenario,
          state: status === "passed" ? "verified" : "rejected",
          status,
          startedAt: now,
          finishedAt: now,
          trace: {
            requestGroupId: `run:${platform}`,
            instance: {
              instanceId: scenario.expectedInstanceId,
              publicName: `${platform} workstation`,
              sessionId: scenario.expectedSessionId,
              status: "connected",
              observedAt: now,
              duplicateActiveIdentityCount: 0,
              trustState: "trusted",
              runnableTarget: true,
            },
            command: {
              runId: `run:${platform}`,
              requestGroupId: `run:${platform}`,
              commandId: `command:${platform}`,
              instanceId: scenario.expectedInstanceId,
              sessionId: scenario.expectedSessionId,
              method: "system.info",
              readOnly: true,
              deliveryStatus: "acked",
            },
            observedResult: {
              runId: `run:${platform}`,
              commandId: `command:${platform}`,
              instanceId: scenario.expectedInstanceId,
              sessionId: scenario.expectedSessionId,
              status: "observed",
              evidenceRef: `evidence:${platform}`,
            },
            resultDiagnosis: {
              diagnosedBy: "llm",
              status: "complete",
              contextFingerprint: `sha256:${"a".repeat(64)}`,
              criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
              evidenceRefs: [`evidence:${platform}`],
            },
            auditEventId: `audit:${platform}`,
            redactionStatus: "verified",
          },
        },
      ],
    } as YeonjangLiveSmokeSummary,
  }
}

describe("Task 036 Yeonjang platform acceptance matrix", () => {
  it("keeps deterministic package smoke and live device acceptance independent", () => {
    const matrix = buildYeonjangPlatformAcceptanceMatrix({
      requiredPlatforms: ["linux", "windows", "macos"],
      availablePlatforms: ["macos"],
      deterministicReceipts: [
        { platform: "linux", status: "passed", reasonCodes: [] },
        { platform: "windows", status: "passed", reasonCodes: [] },
        { platform: "macos", status: "passed", reasonCodes: [] },
      ],
      liveRecords: [liveRun("macos", "passed")],
      now: 1_000,
      maxSessionAgeMs: 1_000,
    })
    expect(matrix.platforms).toEqual([
      expect.objectContaining({ platform: "linux", deterministic: "passed", live: "unavailable" }),
      expect.objectContaining({ platform: "macos", deterministic: "passed", live: "passed" }),
      expect.objectContaining({
        platform: "windows",
        deterministic: "passed",
        live: "unavailable",
      }),
    ])
    expect(matrix.deterministicReady).toBe(true)
    expect(matrix.availableLiveReady).toBe(true)
    expect(matrix.publicReleaseReady).toBe(false)
    expect(matrix.platforms.find((row) => row.platform === "macos")?.executedAt).toBe(1_000)
  })

  it("never converts not-run or failed live evidence into a passed release state", () => {
    const matrix = buildYeonjangPlatformAcceptanceMatrix({
      requiredPlatforms: ["macos", "windows"],
      availablePlatforms: ["macos", "windows"],
      deterministicReceipts: [
        { platform: "macos", status: "passed", reasonCodes: [] },
        { platform: "windows", status: "passed", reasonCodes: [] },
      ],
      liveRecords: [liveRun("windows", "failed")],
      now: 1_000,
      maxSessionAgeMs: 1_000,
    })
    expect(matrix.platforms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: "macos", live: "not_run" }),
        expect.objectContaining({ platform: "windows", live: "failed" }),
      ]),
    )
    expect(matrix.availableLiveReady).toBe(false)
    expect(matrix.publicReleaseReady).toBe(false)
    expect(JSON.stringify(matrix)).not.toMatch(/:private|:session|command:/u)
  })

  it("rejects an otherwise valid live run when build revision evidence is missing", () => {
    const record = liveRun("macos", "passed")
    const matrix = buildYeonjangPlatformAcceptanceMatrix({
      requiredPlatforms: ["macos"],
      availablePlatforms: ["macos"],
      deterministicReceipts: [{ platform: "macos", status: "passed", reasonCodes: [] }],
      liveRecords: [{ ...record, buildRevision: "" }],
      now: 1_000,
      maxSessionAgeMs: 1_000,
    })

    expect(matrix.platforms.find((row) => row.platform === "macos")).toMatchObject({
      live: "failed",
      reasonCodes: ["platform_live_build_revision_missing"],
    })
    expect(matrix.publicReleaseReady).toBe(false)
  })

  it("fails closed when one platform has duplicate deterministic or live records", () => {
    const deterministic = { platform: "macos" as const, status: "passed" as const, reasonCodes: [] }
    const live = liveRun("macos", "passed")
    const matrix = buildYeonjangPlatformAcceptanceMatrix({
      requiredPlatforms: ["macos"],
      availablePlatforms: ["macos"],
      deterministicReceipts: [deterministic, deterministic],
      liveRecords: [live, live],
      now: 1_000,
      maxSessionAgeMs: 1_000,
    })

    expect(matrix.platforms.find((row) => row.platform === "macos")).toMatchObject({
      deterministic: "failed",
      live: "failed",
      reasonCodes: ["platform_deterministic_receipt_duplicate", "platform_live_record_duplicate"],
    })
    expect(matrix.publicReleaseReady).toBe(false)
  })
})
