import { describe, expect, it } from "vitest"
import { createTelegramLiveSmokeExecutor } from "../packages/core/src/channels/telegram-live-smoke-executor.ts"
import { getDefaultChannelSmokeScenarios } from "../packages/core/src/channels/smoke-runner.ts"
import { createWebUiLiveSmokeExecutor } from "../packages/core/src/channels/webui-live-smoke-executor.ts"

const OUTCOME = {
  executionStatus: "succeeded" as const,
  deliveryStatus: "delivered" as const,
}

describe("Task 035 Web Skill channel acceptance", () => {
  it("defines one web_search acceptance scenario for Telegram and WebUI", () => {
    const scenarios = getDefaultChannelSmokeScenarios().filter(
      (scenario) => scenario.kind === "web_skill",
    )
    expect(scenarios).toHaveLength(2)
    expect(scenarios.map((scenario) => scenario.channel).sort()).toEqual([
      "telegram",
      "webui",
    ])
    expect(scenarios.every((scenario) => scenario.expectedTool === "web_search")).toBe(true)
  })

  it("accepts WebUI only with the scoped web_search receipt", async () => {
    const scenario = getDefaultChannelSmokeScenarios().find(
      (candidate) => candidate.id === "webui.web_skill",
    )!
    const started = {
      requestId: "run-webui-035",
      runId: "run-webui-035",
      requestGroupId: "run-webui-035",
    }
    const execute = createWebUiLiveSmokeExecutor({
      startRequest: () => started,
      observeTerminal: async () => ({
        ...started,
        terminalStatus: "completed",
        typedTraceStatus: "ready",
        typedTraceTerminal: true,
        typedTraceIssueCount: 0,
        analysisCompleted: true,
        evidenceRecorded: true,
        reviewCompleted: true,
        finalizationCompleted: true,
        topologyRunCount: 1,
        auditEventId: "audit-webui-035",
        executionOutcome: OUTCOME,
        toolReceipts: [
          {
            ...started,
            toolName: "web_search",
            result: "success",
          },
        ],
      }),
    })
    await expect(execute(scenario)).resolves.toMatchObject({
      toolCalls: [{ toolName: "web_search", sourceChannel: "webui" }],
      semanticOutcome: OUTCOME,
    })
  })

  it("accepts Telegram only with the scoped web_search and delivery receipts", async () => {
    const scenario = getDefaultChannelSmokeScenarios().find(
      (candidate) => candidate.id === "telegram.web_skill",
    )!
    const started = {
      requestId: "run-telegram-035",
      runId: "run-telegram-035",
      requestGroupId: "run-telegram-035",
      targetFingerprint: "telegram-target:035",
    }
    const execute = createTelegramLiveSmokeExecutor({
      startRequest: () => started,
      observeTerminal: async () => ({
        ...started,
        terminalStatus: "completed",
        typedTraceStatus: "ready",
        typedTraceTerminal: true,
        typedTraceIssueCount: 0,
        analysisCompleted: true,
        evidenceRecorded: true,
        reviewCompleted: true,
        finalizationCompleted: true,
        topologyRunCount: 1,
        auditEventId: "audit-telegram-035",
        providerDeliveryReceipted: true,
        targetMatched: true,
        userReportDelivered: true,
        executionOutcome: OUTCOME,
        toolReceipts: [
          {
            ...started,
            toolName: "web_search",
            result: "success",
          },
        ],
      }),
    })
    await expect(execute(scenario)).resolves.toMatchObject({
      toolCalls: [{ toolName: "web_search", sourceChannel: "telegram" }],
      semanticOutcome: OUTCOME,
    })
  })
})
