import { describe, expect, it, vi } from "vitest"
import {
  runYeonjangLiveSmokeScenarios,
  type YeonjangLiveSmokeSelection,
} from "../packages/core/src/runs/yeonjang-live-smoke-runner.ts"

const NOW = Date.parse("2026-07-21T13:00:00.000Z")
const HASH = `sha256:${"a".repeat(64)}` as const

function selection(method: "system.info" | "camera.list", id = method): YeonjangLiveSmokeSelection {
  return {
    scenario: {
      id: `task033:${id}`,
      expectedInstanceId: "instance:task033",
      expectedSessionId: "session:task033",
      expectedMethod: method,
      readOnly: true,
    },
    instance: {
      instanceId: "instance:task033",
      publicName: "Task 033 Mac",
      sessionId: "session:task033",
      status: "connected",
      observedAt: NOW,
      duplicateActiveIdentityCount: 0,
      trustState: "trusted",
      runnableTarget: true,
    },
  }
}

describe("Task 033 Yeonjang live smoke multi runner", () => {
  it("runs multiple read-only selections under one run summary in input order", async () => {
    const calls: string[] = []
    const result = await runYeonjangLiveSmokeScenarios({
      runId: "run:task033",
      selections: [selection("system.info"), selection("camera.list")],
      maxInstanceAgeMs: 10_000,
      now: () => NOW,
      signal: new AbortController().signal,
      execute: async ({ runId, selection: item }) => {
        calls.push(item.scenario.expectedMethod)
        const commandId = `command:${item.scenario.expectedMethod}`
        const evidenceRef = `tool-result:yeonjang:${item.scenario.expectedMethod}`
        return {
          command: {
            runId,
            requestGroupId: runId,
            commandId,
            instanceId: item.scenario.expectedInstanceId,
            sessionId: item.scenario.expectedSessionId,
            method: item.scenario.expectedMethod,
            readOnly: true,
            deliveryStatus: "acked",
          },
          observedResult: {
            runId,
            commandId,
            instanceId: item.scenario.expectedInstanceId,
            sessionId: item.scenario.expectedSessionId,
            status: "observed",
            evidenceRef,
          },
          auditEventId: `audit:${item.scenario.expectedMethod}`,
          diagnosisPayload: {},
        }
      },
      diagnose: async ({ evidenceRef }) => ({
        diagnosedBy: "llm",
        status: "complete",
        contextFingerprint: HASH,
        criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
        evidenceRefs: [evidenceRef],
      }),
    })

    expect(result.status).toBe("passed")
    expect(result.results.map((item) => item.scenario.expectedMethod)).toEqual([
      "system.info",
      "camera.list",
    ])
    expect(calls).toEqual(["system.info", "camera.list"])
  })

  it("marks the summary failed when any selection fails", async () => {
    const execute = vi.fn(async ({ runId, selection: item }) => {
      const commandId = `command:${item.scenario.expectedMethod}`
      const evidenceRef = `tool-result:yeonjang:${item.scenario.expectedMethod}`
      return {
        command: {
          runId,
          requestGroupId: runId,
          commandId,
          instanceId: item.scenario.expectedInstanceId,
          sessionId: item.scenario.expectedSessionId,
          method: item.scenario.expectedMethod,
          readOnly: true,
          deliveryStatus: item.scenario.expectedMethod === "camera.list" ? "failed" : "acked",
        },
        observedResult: {
          runId,
          commandId,
          instanceId: item.scenario.expectedInstanceId,
          sessionId: item.scenario.expectedSessionId,
          status: "observed",
          evidenceRef,
        },
        auditEventId: `audit:${item.scenario.expectedMethod}`,
        diagnosisPayload: {},
      }
    })

    const result = await runYeonjangLiveSmokeScenarios({
      runId: "run:task033:failed",
      selections: [selection("system.info"), selection("camera.list")],
      execute,
      diagnose: async ({ evidenceRef }) => ({
        diagnosedBy: "llm",
        status: "complete",
        contextFingerprint: HASH,
        criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
        evidenceRefs: [evidenceRef],
      }),
      maxInstanceAgeMs: 10_000,
      now: () => NOW,
      signal: new AbortController().signal,
    })

    expect(result.status).toBe("failed")
    expect(result.results).toHaveLength(2)
    expect(result.results[1]?.reasonCode).toBe("yeonjang_smoke_command_not_acked")
  })
})

