import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  type CanonicalSlackSmokeObservation,
  createSlackLiveSmokeExecutor,
} from "../packages/core/src/channels/slack-live-smoke-executor.ts"
import type { ChannelSmokeScenario } from "../packages/core/src/channels/smoke-runner.ts"

const STARTED = {
  requestId: "run-150",
  runId: "run-150",
  requestGroupId: "run-150",
  targetFingerprint: "slack-target:abc150",
}
const SCENARIO: ChannelSmokeScenario = {
  id: "slack.basic_query",
  channel: "slack",
  kind: "basic_query",
  title: "Slack basic query",
  request: "Report current status.",
  expectedTarget: "slack",
  correlationKey: "slack_thread",
  requiresExternalCredential: true,
  releaseGate: "automated",
}

function observation(
  overrides: Partial<CanonicalSlackSmokeObservation> = {},
): CanonicalSlackSmokeObservation {
  return {
    ...STARTED,
    terminalStatus: "completed",
    typedTraceStatus: "ready",
    typedTraceTerminal: true,
    typedTraceIssueCount: 0,
    analysisCompleted: true,
    evidenceRecorded: true,
    reviewCompleted: true,
    finalizationCompleted: true,
    topologyRunCount: 1,
    auditEventId: "finalization-150",
    providerDeliveryReceipted: true,
    targetMatched: true,
    userReportDelivered: true,
    ...overrides,
  }
}

describe("Task 150 Slack live smoke executor", () => {
  it("admits only a fully receipted canonical Slack result", async () => {
    const startRequest = vi.fn(() => STARTED)
    const execute = createSlackLiveSmokeExecutor({
      startRequest,
      observeTerminal: async () => observation(),
    })
    await expect(execute(SCENARIO)).resolves.toMatchObject({
      sourceChannel: "slack",
      responseChannel: "slack",
      correlationKey: "slack_thread",
      requestFlow: { providerDirectUsed: false, requestGroupMatchesRunId: true },
      auditLogId: "finalization-150",
    })
  })

  it.each([
    [{ providerDeliveryReceipted: false }, "slack_live_smoke_provider_receipt_missing"],
    [{ targetMatched: false }, "slack_live_smoke_target_mismatch"],
    [{ userReportDelivered: false }, "slack_live_smoke_user_report_not_delivered"],
    [{ typedTraceTerminal: false }, "slack_live_smoke_typed_trace_invalid"],
  ])("fails closed for incomplete evidence", async (overrides, reason) => {
    const execute = createSlackLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () => observation(overrides),
    })
    await expect(execute(SCENARIO)).rejects.toThrow(reason)
  })

  it("rejects unsupported channel and scenario before ingress", async () => {
    const startRequest = vi.fn(() => STARTED)
    const execute = createSlackLiveSmokeExecutor({
      startRequest,
      observeTerminal: async () => observation(),
    })
    await expect(execute({ ...SCENARIO, channel: "telegram" })).rejects.toThrow(
      "slack_live_smoke_scenario_unsupported",
    )
    await expect(execute({ ...SCENARIO, kind: "artifact_delivery" })).rejects.toThrow(
      "slack_live_smoke_scenario_unsupported",
    )
    expect(startRequest).not.toHaveBeenCalled()
  })

  it("has no provider, DB, environment, prompt, or final-text dependency", () => {
    const source = readFileSync(
      new URL("../packages/core/src/channels/slack-live-smoke-executor.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(/process\.env|db\/|\.\/slack\/|chat\.postMessage|finalText|prompt/u)
  })
})
