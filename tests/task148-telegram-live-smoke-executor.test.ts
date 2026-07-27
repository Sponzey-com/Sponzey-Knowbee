import { describe, expect, it, vi } from "vitest"
import type { ChannelSmokeScenario } from "../packages/core/src/channels/smoke-runner.ts"
import {
  type CanonicalTelegramSmokeObservation,
  type StartedCanonicalTelegramSmokeRequest,
  createTelegramLiveSmokeExecutor,
} from "../packages/core/src/channels/telegram-live-smoke-executor.ts"

const STARTED: StartedCanonicalTelegramSmokeRequest = {
  requestId: "run-148",
  runId: "run-148",
  requestGroupId: "run-148",
  targetFingerprint: "telegram-target:abc123",
}

const SCENARIO: ChannelSmokeScenario = {
  id: "telegram.basic_query",
  channel: "telegram",
  kind: "basic_query",
  title: "Telegram basic query",
  request: "Report current status.",
  expectedTarget: "telegram",
  correlationKey: "telegram_chat_thread",
  requiresExternalCredential: true,
  releaseGate: "automated",
}

const WEB_SKILL_SCENARIO: ChannelSmokeScenario = {
  ...SCENARIO,
  id: "telegram.web_skill",
  kind: "web_skill",
  expectedTool: "web_search",
}

function observation(
  overrides: Partial<CanonicalTelegramSmokeObservation> = {},
): CanonicalTelegramSmokeObservation {
  return {
    ...STARTED,
    terminalStatus: "completed",
    typedTraceStatus: "ready",
    typedTraceTerminal: true,
    typedTraceIssueCount: 0,
    analysisCompleted: true,
    requestDiagnosisReceiptId: "receipt:diagnosis:148",
    solutionPlanReceiptId: "receipt:plan:148",
    capabilityAdmissionReceiptId: "receipt:capability-admission:148",
    evidenceRecorded: true,
    reviewCompleted: true,
    resultReviewReceiptId: "receipt:review:148",
    finalResponseReceiptId: "receipt:final-response:148",
    decisionReceiptOrderValid: true,
    finalizationCompleted: true,
    rootOwnerFinalized: true,
    finalAnswerCount: 1,
    topologyRunCount: 1,
    auditEventId: "finalization-148",
    providerDeliveryReceipted: true,
    targetMatched: true,
    userReportDelivered: true,
    deliveryReceiptRef: "receipt:delivery:148",
    resultReviewReasonCodes: ["goal_satisfied"],
    executionOutcome: {
      executionStatus: "succeeded",
      deliveryStatus: "delivered",
    },
    latencyEvidence: {
      metricId: "latency-148",
      runId: STARTED.runId,
      requestGroupId: STARTED.requestGroupId,
      durationMs: 500,
      budgetMs: 30_000,
      status: "ok",
      terminalResponseLatencyMs: 800,
      completedAt: 1_000,
    },
    ...overrides,
  }
}

describe("Task 148 Telegram live smoke executor", () => {
  it("accepts canonical root execution without requiring a delegated topology run", async () => {
    const execute = createTelegramLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () =>
        observation({
          topologyRunCount: 0,
          toolReceipts: [
            {
              runId: STARTED.runId,
              requestGroupId: STARTED.requestGroupId,
              toolName: "web_search",
              result: "success",
            },
          ],
        }),
    })

    await expect(execute(WEB_SKILL_SCENARIO)).resolves.toMatchObject({
      requestFlow: {
        flowKind: "execution",
        topologyRunCreated: false,
      },
      toolCalls: [{ toolName: "web_search" }],
    })
  })

  it("accepts the canonical direct-response path after one target-bound delivery", async () => {
    const execute = createTelegramLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () =>
        observation({
          typedTraceStatus: "not_recorded",
          typedTraceTerminal: false,
          analysisCompleted: false,
          requestDiagnosisReceiptId: undefined,
          solutionPlanReceiptId: undefined,
          evidenceRecorded: false,
          reviewCompleted: false,
          resultReviewReceiptId: undefined,
          finalResponseReceiptId: undefined,
          decisionReceiptOrderValid: false,
          directResponseReceiptId: "llm-invocation:direct-148",
          directResponseReceiptValid: true,
          finalizationCompleted: false,
          rootOwnerFinalized: false,
          finalAnswerCount: 0,
          topologyRunCount: 0,
          auditEventId: undefined,
          userReportDeliveryCount: 1,
          resultReviewReasonCodes: [],
          executionOutcome: undefined,
        }),
    })

    await expect(execute(SCENARIO)).resolves.toMatchObject({
      requestFlow: {
        flowKind: "direct_response",
        directResponseReceiptId: "llm-invocation:direct-148",
        topologyRunCreated: false,
      },
      finalization: {
        rootOwnerFinalized: true,
        finalAnswerCount: 1,
      },
      auditLogId: "llm-invocation:direct-148",
      semanticReview: {
        reasonCodes: ["direct_response_completed"],
      },
    })
  })

  it("projects a canonical Telegram trace only after provider delivery is verified", async () => {
    const startRequest = vi.fn(() => STARTED)
    const execute = createTelegramLiveSmokeExecutor({
      startRequest,
      observeTerminal: async () => observation(),
    })

    await expect(execute(SCENARIO)).resolves.toMatchObject({
      sourceChannel: "telegram",
      responseChannel: "telegram",
      correlationKey: "telegram_chat_thread",
      requestFlow: {
        runId: STARTED.runId,
        requestGroupId: STARTED.requestGroupId,
        requestGroupMatchesRunId: true,
        decisionTracePresent: true,
        topologyRunCreated: true,
        providerDirectUsed: false,
      },
      auditLogId: "finalization-148",
    })
    expect(startRequest).toHaveBeenCalledWith({ request: SCENARIO.request, source: "telegram" })
  })

  it("fails closed without a solution plan reference or provider-safe delivery ref", async () => {
    const executeWithoutPlan = createTelegramLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () => observation({
        solutionPlanReceiptId: undefined,
      } as Partial<CanonicalTelegramSmokeObservation>),
    })
    await expect(executeWithoutPlan(SCENARIO)).rejects.toThrow(
      "telegram_live_smoke_solution_plan_receipt_missing",
    )

    const executeWithoutDeliveryRef = createTelegramLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () => observation({
        deliveryReceiptRef: undefined,
      } as Partial<CanonicalTelegramSmokeObservation>),
    })
    await expect(executeWithoutDeliveryRef(SCENARIO)).rejects.toThrow(
      "telegram_live_smoke_delivery_receipt_ref_missing",
    )
  })

  it.each([
    [{ providerDeliveryReceipted: false }, "telegram_live_smoke_provider_receipt_missing"],
    [{ targetMatched: false }, "telegram_live_smoke_target_mismatch"],
    [{ userReportDelivered: false }, "telegram_live_smoke_user_report_not_delivered"],
    [{ typedTraceTerminal: false }, "telegram_live_smoke_typed_trace_invalid"],
    [{ requestGroupId: "other-group" }, "telegram_live_smoke_observation_identity_mismatch"],
    [{ executionOutcome: undefined }, "telegram_live_smoke_semantic_outcome_missing"],
  ])("fails closed when delivery evidence is incomplete", async (overrides, reasonCode) => {
    const execute = createTelegramLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () => observation(overrides),
    })
    await expect(execute(SCENARIO)).rejects.toThrow(reasonCode)
  })

  it("rejects non-Telegram scenarios before ingress and malformed tool scenarios after observation", async () => {
    const startRequest = vi.fn(() => STARTED)
    const execute = createTelegramLiveSmokeExecutor({
      startRequest,
      observeTerminal: async () => observation(),
    })

    await expect(execute({ ...SCENARIO, channel: "webui" })).rejects.toThrow(
      "telegram_live_smoke_scenario_unsupported",
    )
    await expect(execute({ ...SCENARIO, kind: "artifact_delivery" })).rejects.toThrow(
      "telegram_live_smoke_expected_tool_missing",
    )
    expect(startRequest).toHaveBeenCalledTimes(1)
  })
})
