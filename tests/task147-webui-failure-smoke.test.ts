import { describe, expect, it } from "vitest"
import type { ChannelSmokeScenario } from "../packages/core/src/channels/smoke-runner.ts"
import {
  type CanonicalWebUiSmokeObservation,
  type StartedCanonicalWebUiSmokeRequest,
  createWebUiLiveSmokeExecutor,
} from "../packages/core/src/channels/webui-live-smoke-executor.ts"

const STARTED: StartedCanonicalWebUiSmokeRequest = {
  requestId: "run-147",
  runId: "run-147",
  requestGroupId: "run-147",
}

const SCENARIO: ChannelSmokeScenario = {
  id: "webui.failure_tool",
  channel: "webui",
  kind: "failure_tool",
  title: "WebUI unsupported capability",
  request: "Run an unavailable extension capability.",
  expectedTarget: "webui",
  correlationKey: "webui_run_id",
  requiresExternalCredential: false,
  expectsFailure: true,
  expectsUnsupportedCapability: true,
  releaseGate: "automated",
}

function observation(
  overrides: Partial<CanonicalWebUiSmokeObservation> = {},
): CanonicalWebUiSmokeObservation {
  return {
    ...STARTED,
    terminalStatus: "failed",
    typedTraceStatus: "ready",
    typedTraceTerminal: true,
    typedTraceIssueCount: 0,
    analysisCompleted: true,
    requestDiagnosisReceiptId: "receipt:diagnosis:147",
    solutionPlanReceiptId: "receipt:plan:147",
    evidenceRecorded: true,
    reviewCompleted: true,
    resultReviewReceiptId: "receipt:review:147",
    finalResponseReceiptId: "receipt:final-response:147",
    decisionReceiptOrderValid: true,
    finalizationCompleted: true,
    rootOwnerFinalized: true,
    finalAnswerCount: 1,
    topologyRunCount: 1,
    auditEventId: "finalization-147",
    deliveryReceiptRef: "receipt:delivery:147",
    userReportDeliveryCount: 1,
    latencyEvidence: {
      metricId: "latency-147",
      runId: STARTED.runId,
      requestGroupId: STARTED.requestGroupId,
      durationMs: 500,
      budgetMs: 30_000,
      status: "ok",
      terminalResponseLatencyMs: 800,
      completedAt: 1_000,
    },
    executionOutcome: {
      executionStatus: "exhausted",
      deliveryStatus: "delivered",
    },
    capabilityReceipts: [
      {
        runId: STARTED.runId,
        requestGroupId: STARTED.requestGroupId,
        capability: "tool_execution",
        receiptStatus: "unsupported_capability",
      },
    ],
    resultReviewReasonCodes: ["paths_exhausted"],
    userReportDelivered: true,
    ...overrides,
  }
}

function executeWith(value: CanonicalWebUiSmokeObservation) {
  return createWebUiLiveSmokeExecutor({
    startRequest: () => STARTED,
    observeTerminal: async () => value,
  })(SCENARIO)
}

describe("Task 147 WebUI failure smoke", () => {
  it("projects unsupported capability only after result review and user delivery", async () => {
    await expect(executeWith(observation())).resolves.toMatchObject({
      capabilityFallbacks: [
        {
          capability: "tool_execution",
          receiptStatus: "unsupported_capability",
          userVisible: true,
        },
      ],
    })
  })

  it("projects a bounded capability receipt from the canonical exhausted outcome", async () => {
    await expect(
      executeWith(observation({ capabilityReceipts: [] })),
    ).resolves.toMatchObject({
      capabilityFallbacks: [
        {
          capability: "tool_execution",
          receiptStatus: "unsupported_capability",
          userVisible: true,
        },
      ],
    })
  })

  it.each([
    [
      {
        capabilityReceipts: [],
        executionOutcome: {
          executionStatus: "succeeded" as const,
          deliveryStatus: "delivered" as const,
        },
      },
      "webui_live_smoke_expected_exhausted_outcome",
    ],
    [
      { resultReviewReasonCodes: ["all_criteria_verified"] },
      "webui_live_smoke_paths_not_exhausted",
    ],
    [{ userReportDelivered: false }, "webui_live_smoke_user_report_not_delivered"],
    [
      {
        capabilityReceipts: [
          {
            runId: STARTED.runId,
            requestGroupId: "other-group",
            capability: "tool_execution",
            receiptStatus: "unsupported_capability" as const,
          },
        ],
      },
      "webui_live_smoke_capability_receipt_missing",
    ],
  ])("fails closed when terminal failure evidence is incomplete", async (overrides, reasonCode) => {
    await expect(executeWith(observation(overrides))).rejects.toThrow(reasonCode)
  })
})
