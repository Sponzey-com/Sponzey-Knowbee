import { describe, expect, it, vi } from "vitest"
import type { ChannelSmokeScenario } from "../packages/core/src/channels/smoke-runner.ts"
import {
  type CanonicalWebUiSmokeObservation,
  type StartedCanonicalWebUiSmokeRequest,
  createWebUiLiveSmokeExecutor,
} from "../packages/core/src/channels/webui-live-smoke-executor.ts"

const BASIC_WEBUI_SCENARIO: ChannelSmokeScenario = {
  id: "webui.basic_query",
  channel: "webui",
  kind: "basic_query",
  title: "WebUI basic query",
  request: "Report current status.",
  expectedTarget: "webui",
  correlationKey: "webui_run_id",
  requiresExternalCredential: false,
  releaseGate: "automated",
}

const APPROVAL_SCENARIO: ChannelSmokeScenario = {
  ...BASIC_WEBUI_SCENARIO,
  id: "webui.approval_required_tool",
  kind: "approval_required_tool",
  expectedTool: "screen_capture",
  expectsApproval: true,
  expectsArtifact: true,
}

const ARTIFACT_SCENARIO: ChannelSmokeScenario = {
  ...BASIC_WEBUI_SCENARIO,
  id: "webui.artifact_delivery",
  kind: "artifact_delivery",
  expectedTool: "screen_capture",
  expectsArtifact: true,
}

const WEB_SKILL_SCENARIO: ChannelSmokeScenario = {
  ...BASIC_WEBUI_SCENARIO,
  id: "webui.web_skill",
  kind: "web_skill",
  expectedTool: "web_search",
}

const FAILURE_SCENARIO: ChannelSmokeScenario = {
  ...BASIC_WEBUI_SCENARIO,
  id: "webui.failure_tool",
  kind: "failure_tool",
  expectsFailure: true,
}

const STARTED: StartedCanonicalWebUiSmokeRequest = {
  requestId: "request-145",
  runId: "run-145",
  requestGroupId: "run-145",
}

function completedObservation(
  overrides: Partial<CanonicalWebUiSmokeObservation> = {},
): CanonicalWebUiSmokeObservation {
  return {
    ...STARTED,
    terminalStatus: "completed",
    typedTraceStatus: "ready",
    typedTraceTerminal: true,
    typedTraceIssueCount: 0,
    analysisCompleted: true,
    requestDiagnosisReceiptId: "receipt:diagnosis:145",
    solutionPlanReceiptId: "receipt:plan:145",
    capabilityAdmissionReceiptId: "receipt:capability-admission:145",
    evidenceRecorded: true,
    reviewCompleted: true,
    resultReviewReceiptId: "receipt:review:145",
    finalResponseReceiptId: "receipt:final-response:145",
    decisionReceiptOrderValid: true,
    finalizationCompleted: true,
    rootOwnerFinalized: true,
    finalAnswerCount: 1,
    topologyRunCount: 1,
    auditEventId: "audit-event-145",
    userReportDelivered: true,
    deliveryReceiptRef: "receipt:delivery:145",
    resultReviewReasonCodes: ["goal_satisfied"],
    executionOutcome: {
      executionStatus: "succeeded",
      deliveryStatus: "delivered",
    },
    latencyEvidence: {
      metricId: "latency-145",
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

describe("Task 145 WebUI live smoke executor", () => {
  it("accepts an expected failed terminal only with exhausted paths and one delivered report", async () => {
    const execute = createWebUiLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () =>
        completedObservation({
          terminalStatus: "failed",
          resultReviewReasonCodes: ["paths_exhausted"],
          executionOutcome: {
            executionStatus: "exhausted",
            deliveryStatus: "delivered",
          },
          capabilityReceipts: [
            {
              ...STARTED,
              capability: "unsupported_extension_action",
              receiptStatus: "unsupported_capability",
            },
          ],
          userReportDelivered: true,
          userReportDeliveryCount: 1,
        }),
    })

    await expect(execute(FAILURE_SCENARIO)).resolves.toMatchObject({
      semanticOutcome: {
        executionStatus: "exhausted",
        deliveryStatus: "delivered",
      },
      semanticReview: {
        reasonCodes: ["paths_exhausted"],
      },
      finalization: {
        finalAnswerCount: 1,
      },
    })
  })

  it("accepts canonical root execution without requiring a delegated topology run", async () => {
    const execute = createWebUiLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () =>
        completedObservation({
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

  it("accepts the canonical direct-response path without execution-only trace receipts", async () => {
    const execute = createWebUiLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () =>
        completedObservation({
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
          directResponseReceiptId: "llm-invocation:direct-145",
          directResponseReceiptValid: true,
          finalizationCompleted: false,
          rootOwnerFinalized: false,
          finalAnswerCount: 0,
          topologyRunCount: 0,
          auditEventId: undefined,
          resultReviewReasonCodes: [],
          executionOutcome: undefined,
          userReportDeliveryCount: 1,
        }),
    })

    await expect(execute(BASIC_WEBUI_SCENARIO)).resolves.toMatchObject({
      requestFlow: {
        flowKind: "direct_response",
        directResponseReceiptId: "llm-invocation:direct-145",
        topologyRunCreated: false,
        providerDirectUsed: false,
      },
      finalization: {
        rootOwnerFinalized: true,
        finalAnswerCount: 1,
      },
      auditLogId: "llm-invocation:direct-145",
      semanticOutcome: {
        executionStatus: "succeeded",
        deliveryStatus: "delivered",
      },
      semanticReview: {
        reasonCodes: ["direct_response_completed"],
      },
    })
  })

  it("projects a completed canonical request and typed terminal evidence", async () => {
    const startRequest = vi.fn(() => STARTED)
    const observeTerminal = vi.fn(async () => completedObservation())
    const execute = createWebUiLiveSmokeExecutor({ startRequest, observeTerminal })

    await expect(execute(BASIC_WEBUI_SCENARIO)).resolves.toEqual({
      sourceChannel: "webui",
      responseChannel: "webui",
      correlationKey: "webui_run_id",
      requestFlow: {
        runId: "run-145",
        requestGroupId: "run-145",
        requestGroupMatchesRunId: true,
        flowKind: "execution",
        decisionTracePresent: true,
        requestDiagnosisReceiptId: "receipt:diagnosis:145",
        solutionPlanReceiptId: "receipt:plan:145",
        resultReviewReceiptId: "receipt:review:145",
        finalResponseReceiptId: "receipt:final-response:145",
        decisionReceiptOrderValid: true,
        topologyRunCreated: true,
        providerDirectUsed: false,
      },
      finalization: {
        rootOwnerFinalized: true,
        finalAnswerCount: 1,
      },
      latency: {
        metricId: "latency-145",
        runId: "run-145",
        requestGroupId: "run-145",
        firstResponseLatencyMs: 500,
        firstResponseBudgetMs: 30_000,
        firstResponseStatus: "ok",
        terminalResponseLatencyMs: 800,
      },
      finalDelivery: {
        delivered: true,
        targetChannel: "webui",
        correlationKey: "webui_run_id",
        receiptRef: "receipt:delivery:145",
        userVisible: true,
      },
      auditLogId: "audit-event-145",
      semanticOutcome: {
        executionStatus: "succeeded",
        deliveryStatus: "delivered",
      },
      semanticReview: {
        requiredCompletionConditionIds: ["condition:execution", "condition:delivery"],
        satisfiedCompletionConditionIds: ["condition:execution", "condition:delivery"],
        reasonCodes: ["goal_satisfied"],
        terminalReport: "delivered",
        evidenceRefs: ["receipt:review:145", "receipt:delivery:145"],
      },
    })
    expect(startRequest).toHaveBeenCalledWith({
      request: BASIC_WEBUI_SCENARIO.request,
      source: "webui",
    })
    expect(observeTerminal).toHaveBeenCalledWith({ started: STARTED })
  })

  it("rejects unsupported channels before starting work", async () => {
    const startRequest = vi.fn(() => STARTED)
    const observeTerminal = vi.fn(async () => completedObservation())
    const execute = createWebUiLiveSmokeExecutor({ startRequest, observeTerminal })

    await expect(execute({ ...BASIC_WEBUI_SCENARIO, channel: "telegram" })).rejects.toThrow(
      "webui_live_smoke_scenario_unsupported",
    )
    expect(startRequest).not.toHaveBeenCalled()
    expect(observeTerminal).not.toHaveBeenCalled()
  })

  it("fails closed without a solution plan reference and visible delivery receipt", async () => {
    const startRequest = vi.fn(() => STARTED)
    const executeWithoutPlan = createWebUiLiveSmokeExecutor({
      startRequest,
      observeTerminal: vi.fn(async () => completedObservation({
        solutionPlanReceiptId: undefined,
      } as Partial<CanonicalWebUiSmokeObservation>)),
    })
    await expect(executeWithoutPlan(BASIC_WEBUI_SCENARIO)).rejects.toThrow(
      "webui_live_smoke_solution_plan_receipt_missing",
    )

    const executeWithoutDelivery = createWebUiLiveSmokeExecutor({
      startRequest,
      observeTerminal: vi.fn(async () => completedObservation({
        userReportDelivered: false,
        deliveryReceiptRef: undefined,
      } as Partial<CanonicalWebUiSmokeObservation>)),
    })
    await expect(executeWithoutDelivery(BASIC_WEBUI_SCENARIO)).rejects.toThrow(
      "webui_live_smoke_user_report_not_delivered",
    )
  })

  it("fails closed when canonical terminal evidence is missing or inconsistent", async () => {
    const observations = [
      completedObservation({ typedTraceStatus: "unavailable" }),
      completedObservation({ typedTraceTerminal: false }),
      completedObservation({ reviewCompleted: false }),
      completedObservation({ auditEventId: undefined }),
      completedObservation({ requestGroupId: "other-group" }),
      completedObservation({ executionOutcome: undefined }),
    ]

    for (const observation of observations) {
      const execute = createWebUiLiveSmokeExecutor({
        startRequest: () => STARTED,
        observeTerminal: async () => observation,
      })
      await expect(execute(BASIC_WEBUI_SCENARIO)).rejects.toThrow(/^webui_live_smoke_[a-z_]+$/u)
    }
  })

  it("does not expose raw observer failures", async () => {
    const execute = createWebUiLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () => {
        throw new Error("Bearer secret-token at /Users/private/channel")
      },
    })

    const error = await execute(BASIC_WEBUI_SCENARIO).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe("webui_live_smoke_observation_failed")
  })

  it("projects an observed WebUI tool approval without granting it itself", async () => {
    const execute = createWebUiLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () =>
        completedObservation({
          toolReceipts: [
            {
              ...STARTED,
              toolName: "screen_capture",
              result: "success",
            },
          ],
          approvalReceipts: [
            {
              ...STARTED,
              channel: "webui",
              toolName: "screen_capture",
              status: "consumed",
              uiVisible: true,
            },
          ],
          artifactReceipts: [
            {
              ...STARTED,
              channel: "webui",
              mode: "inline_preview",
              url: "/api/artifacts/smoke.png",
            },
          ],
        }),
    })

    await expect(execute(APPROVAL_SCENARIO)).resolves.toMatchObject({
      requestFlow: {
        capabilityAdmissionRequired: true,
        capabilityAdmissionReceiptId: "receipt:capability-admission:145",
      },
      toolCalls: [
        {
          toolName: "screen_capture",
          sourceChannel: "webui",
          deliveryChannel: "webui",
        },
      ],
      approval: {
        requested: true,
        targetChannel: "webui",
        correlationKey: "webui_run_id",
        uiVisible: true,
        uiKind: "inline",
      },
      artifacts: [
        {
          channel: "webui",
          mode: "inline_preview",
          url: "/api/artifacts/smoke.png",
        },
      ],
    })
  })

  it("rejects an action scenario without a capability admission receipt", async () => {
    const execute = createWebUiLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () =>
        completedObservation({
          capabilityAdmissionReceiptId: undefined,
          toolReceipts: [
            { ...STARTED, toolName: "screen_capture", result: "success" },
          ],
          artifactReceipts: [
            {
              ...STARTED,
              channel: "webui",
              mode: "download_link",
              url: "/api/artifacts/smoke.png",
            },
          ],
        }),
    })
    await expect(execute(ARTIFACT_SCENARIO)).rejects.toThrow(
      "webui_live_smoke_capability_admission_receipt_missing",
    )
  })

  it("projects only WebUI-safe artifact delivery receipts", async () => {
    const execute = createWebUiLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () =>
        completedObservation({
          toolReceipts: [
            {
              ...STARTED,
              toolName: "screen_capture",
              result: "success",
            },
          ],
          artifactReceipts: [
            {
              ...STARTED,
              channel: "webui",
              mode: "download_link",
              url: "/api/artifacts/smoke.png?download=1",
            },
          ],
        }),
    })

    await expect(execute(ARTIFACT_SCENARIO)).resolves.toMatchObject({
      toolCalls: [{ toolName: "screen_capture" }],
      artifacts: [
        {
          channel: "webui",
          mode: "download_link",
          url: "/api/artifacts/smoke.png?download=1",
        },
      ],
    })
  })
})
