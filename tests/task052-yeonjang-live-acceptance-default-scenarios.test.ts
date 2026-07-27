import { describe, expect, it, vi } from "vitest"
import { expandYeonjangLiveAcceptanceSelections } from "../packages/core/src/release/live-acceptance-verified-executor.ts"
import {
  isYeonjangLiveSmokeReadOnlyMethod,
  type YeonjangLiveSmokeReadOnlyMethod,
} from "../packages/core/src/runs/yeonjang-live-smoke.ts"
import {
  type YeonjangLiveSmokeExecutionInput,
  type YeonjangLiveSmokeSelection,
  runYeonjangLiveSmokeScenario,
} from "../packages/core/src/runs/yeonjang-live-smoke-runner.ts"

const NOW = Date.parse("2026-07-21T15:00:00.000Z")

function selection(
  method: YeonjangLiveSmokeReadOnlyMethod = "system.info",
  params?: Readonly<Record<string, unknown>>,
): YeonjangLiveSmokeSelection {
  return Object.freeze({
    scenario: Object.freeze({
      id: `task052-${method.replaceAll(".", "-")}`,
      expectedInstanceId: "instance:task052",
      expectedSessionId: "session:task052",
      expectedMethod: method,
      ...(params ? { params } : {}),
      readOnly: true,
    }),
    instance: Object.freeze({
      instanceId: "instance:task052",
      publicName: "Task 052 Mac",
      sessionId: "session:task052",
      status: "connected",
      observedAt: NOW,
      duplicateActiveIdentityCount: 0,
      trustState: "trusted",
      runnableTarget: true,
    }),
  })
}

describe("Task 052 Yeonjang live acceptance default scenarios", () => {
  it("expands path-backed Yeonjang selection into the required read-only default smoke methods", () => {
    const expanded = expandYeonjangLiveAcceptanceSelections(
      selection("file.list", Object.freeze({ path: "/Users/example/Documents", limit: 50 })),
    )

    expect(expanded.map((item) => item.scenario.expectedMethod)).toEqual([
      "node.capabilities",
      "system.info",
      "camera.list",
      "file.list",
      "disk.usage",
    ])
    expect(expanded.every((item) => isYeonjangLiveSmokeReadOnlyMethod(item.scenario.expectedMethod)))
      .toBe(true)
    expect(expanded.find((item) => item.scenario.expectedMethod === "file.list")?.scenario.params)
      .toEqual({ path: "/Users/example/Documents" })
    expect(expanded.find((item) => item.scenario.expectedMethod === "disk.usage")?.scenario.params)
      .toEqual({ path: "/Users/example/Documents" })
  })

  it("does not include path-backed file or disk methods without an explicit path", () => {
    const expanded = expandYeonjangLiveAcceptanceSelections(selection("system.info"))

    expect(expanded.map((item) => item.scenario.expectedMethod)).toEqual([
      "node.capabilities",
      "system.info",
      "camera.list",
    ])
  })

  it("rejects a successful Yeonjang dispatch when LLM result diagnosis is invalid", async () => {
    const execute = vi.fn(async ({ runId, selection }: YeonjangLiveSmokeExecutionInput) => {
      const commandId = "command:task052"
      return {
        command: {
          runId,
          requestGroupId: runId,
          commandId,
          instanceId: selection.scenario.expectedInstanceId,
          sessionId: selection.scenario.expectedSessionId,
          method: selection.scenario.expectedMethod,
          readOnly: true,
          deliveryStatus: "acked" as const,
        },
        observedResult: {
          runId,
          commandId,
          instanceId: selection.scenario.expectedInstanceId,
          sessionId: selection.scenario.expectedSessionId,
          status: "observed" as const,
          evidenceRef: "tool-result:yeonjang:task052",
        },
        auditEventId: "audit:yeonjang:task052",
        diagnosisPayload: Object.freeze({ transport: "ok" }),
      }
    })

    const result = await runYeonjangLiveSmokeScenario({
      runId: "run:task052",
      selection: selection("camera.list"),
      execute,
      diagnose: vi.fn(async () => ({
        diagnosedBy: "llm",
        status: "followup",
        contextFingerprint: `sha256:${"a".repeat(64)}`,
        criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
        evidenceRefs: ["tool-result:yeonjang:task052"],
      })),
      maxInstanceAgeMs: 5_000,
      now: () => NOW,
      signal: new AbortController().signal,
    })

    expect(result.status).toBe("failed")
    expect(result.results[0]?.reasonCode).toBe("yeonjang_smoke_llm_diagnosis_invalid")
    expect(result.results[0]?.trace?.command?.deliveryStatus).toBe("acked")
    expect(result.results[0]?.trace?.observedResult?.status).toBe("observed")
  })
})
