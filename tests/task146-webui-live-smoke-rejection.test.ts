import { describe, expect, it } from "vitest"
import type { ChannelSmokeScenario } from "../packages/core/src/channels/smoke-runner.ts"
import { createWebUiLiveSmokeExecutor } from "../packages/core/src/channels/webui-live-smoke-executor.ts"
import type {
  CanonicalWebUiSmokeObservation,
  StartedCanonicalWebUiSmokeRequest,
} from "../packages/core/src/channels/webui-live-smoke-executor.ts"

const STARTED: StartedCanonicalWebUiSmokeRequest = {
  requestId: "run-146",
  runId: "run-146",
  requestGroupId: "run-146",
}

const SCENARIO: ChannelSmokeScenario = {
  id: "webui.approval_required_tool",
  channel: "webui",
  kind: "approval_required_tool",
  title: "WebUI approval",
  request: "Capture the screen.",
  expectedTarget: "webui",
  correlationKey: "webui_run_id",
  requiresExternalCredential: false,
  expectedTool: "screen_capture",
  expectsApproval: true,
  expectsArtifact: true,
  releaseGate: "automated",
}

function observation(
  overrides: Partial<CanonicalWebUiSmokeObservation> = {},
): CanonicalWebUiSmokeObservation {
  return {
    ...STARTED,
    terminalStatus: "completed",
    typedTraceStatus: "ready",
    typedTraceTerminal: true,
    typedTraceIssueCount: 0,
    analysisCompleted: true,
    requestDiagnosisReceiptId: "receipt:diagnosis:146",
    solutionPlanReceiptId: "receipt:plan:146",
    capabilityAdmissionReceiptId: "receipt:capability-admission:146",
    evidenceRecorded: true,
    reviewCompleted: true,
    resultReviewReceiptId: "receipt:review:146",
    finalResponseReceiptId: "receipt:final-response:146",
    decisionReceiptOrderValid: true,
    finalizationCompleted: true,
    rootOwnerFinalized: true,
    finalAnswerCount: 1,
    topologyRunCount: 1,
    auditEventId: "finalization-146",
    resultReviewReasonCodes: ["goal_satisfied"],
    userReportDelivered: true,
    userReportDeliveryCount: 1,
    deliveryReceiptRef: "receipt:delivery:146",
    executionOutcome: {
      executionStatus: "succeeded",
      deliveryStatus: "delivered",
    },
    latencyEvidence: {
      metricId: "latency-146",
      runId: STARTED.runId,
      requestGroupId: STARTED.requestGroupId,
      durationMs: 500,
      budgetMs: 30_000,
      status: "ok",
      terminalResponseLatencyMs: 800,
      completedAt: 1_000,
    },
    toolReceipts: [
      {
        runId: STARTED.runId,
        requestGroupId: STARTED.requestGroupId,
        toolName: "screen_capture",
        result: "success",
      },
    ],
    approvalReceipts: [
      {
        runId: STARTED.runId,
        requestGroupId: STARTED.requestGroupId,
        channel: "webui",
        toolName: "screen_capture",
        status: "consumed",
        uiVisible: true,
      },
    ],
    artifactReceipts: [
      {
        runId: STARTED.runId,
        requestGroupId: STARTED.requestGroupId,
        channel: "webui",
        mode: "inline_preview",
        url: "/api/artifacts/capture.png",
      },
    ],
    ...overrides,
  }
}

function executeWith(value: CanonicalWebUiSmokeObservation) {
  return createWebUiLiveSmokeExecutor({
    startRequest: () => STARTED,
    observeTerminal: async () => value,
  })(SCENARIO)
}

describe("Task 146 WebUI live smoke receipt rejection", () => {
  it.each([
    ["requested", "webui_live_smoke_approval_unresolved"],
    ["denied", "webui_live_smoke_approval_denied"],
    ["expired", "webui_live_smoke_approval_timed_out"],
  ] as const)("rejects %s approval receipts", async (status, reasonCode) => {
    await expect(
      executeWith(
        observation({
          approvalReceipts: [
            {
              runId: STARTED.runId,
              requestGroupId: STARTED.requestGroupId,
              channel: "webui",
              toolName: "screen_capture",
              status,
              uiVisible: true,
            },
          ],
        }),
      ),
    ).rejects.toThrow(reasonCode)
  })

  it("rejects a receipt from another request group", async () => {
    await expect(
      executeWith(
        observation({
          toolReceipts: [
            {
              runId: STARTED.runId,
              requestGroupId: "other-group",
              toolName: "screen_capture",
              result: "success",
            },
          ],
        }),
      ),
    ).rejects.toThrow("webui_live_smoke_tool_receipt_missing")
  })

  it("rejects an unsafe artifact projection without exposing it", async () => {
    const error = await executeWith(
      observation({
        artifactReceipts: [
          {
            runId: STARTED.runId,
            requestGroupId: STARTED.requestGroupId,
            channel: "webui",
            mode: "download_link",
            url: "/Users/private/capture.png?token=secret-token",
          },
        ],
      }),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe("webui_live_smoke_artifact_projection_unsafe")
  })

  it("rejects an approval that was not visible in WebUI", async () => {
    await expect(
      executeWith(
        observation({
          approvalReceipts: [
            {
              runId: STARTED.runId,
              requestGroupId: STARTED.requestGroupId,
              channel: "webui",
              toolName: "screen_capture",
              status: "consumed",
              uiVisible: false,
            },
          ],
        }),
      ),
    ).rejects.toThrow("webui_live_smoke_approval_ui_missing")
  })
})
