import { describe, expect, it, vi } from "vitest"
import { createTelegramLiveSmokeEvidenceReader } from "../packages/core/src/api/telegram-live-smoke-evidence.ts"
import type { ChannelSmokeScenario } from "../packages/core/src/channels/smoke-runner.ts"
import type {
  DbArtifactReceipt,
  DbAuditLog,
} from "../packages/core/src/db/index.ts"
import type { ApprovalRegistryRow } from "../packages/core/src/runs/approval-registry.ts"
import {
  type CanonicalTelegramSmokeObservation,
  type StartedCanonicalTelegramSmokeRequest,
  createTelegramLiveSmokeExecutor,
} from "../packages/core/src/channels/telegram-live-smoke-executor.ts"

const STARTED: StartedCanonicalTelegramSmokeRequest = {
  requestId: "run-033",
  runId: "run-033",
  requestGroupId: "run-033",
  targetFingerprint: "telegram-target:task033",
}

function scenario(
  kind: ChannelSmokeScenario["kind"],
  overrides: Partial<ChannelSmokeScenario> = {},
): ChannelSmokeScenario {
  return {
    id: `telegram.${kind}`,
    channel: "telegram",
    kind,
    title: kind,
    request: `run ${kind}`,
    expectedTarget: "telegram",
    correlationKey: "telegram_chat_thread",
    requiresExternalCredential: true,
    releaseGate: "automated",
    ...overrides,
  }
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
    requestDiagnosisReceiptId: "receipt:diagnosis:033",
    solutionPlanReceiptId: "receipt:plan:033",
    capabilityAdmissionReceiptId: "receipt:capability-admission:033",
    evidenceRecorded: true,
    reviewCompleted: true,
    resultReviewReceiptId: "receipt:review:033",
    finalResponseReceiptId: "receipt:final-response:033",
    decisionReceiptOrderValid: true,
    finalizationCompleted: true,
    rootOwnerFinalized: true,
    finalAnswerCount: 1,
    topologyRunCount: 1,
    auditEventId: "finalization-033",
    providerDeliveryReceipted: true,
    targetMatched: true,
    userReportDelivered: true,
    deliveryReceiptRef: "receipt:delivery:033",
    executionOutcome: {
      executionStatus: "succeeded",
      deliveryStatus: "delivered",
    },
    latencyEvidence: {
      metricId: "latency-033",
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
        channel: "telegram",
        toolName: "screen_capture",
        status: "consumed",
        uiVisible: true,
      },
    ],
    artifactReceipts: [
      {
        runId: STARTED.runId,
        requestGroupId: STARTED.requestGroupId,
        channel: "telegram",
        mode: "native_file",
      },
    ],
    capabilityReceipts: [
      {
        runId: STARTED.runId,
        requestGroupId: STARTED.requestGroupId,
        capability: "tool_execution",
        receiptStatus: "unsupported_capability",
      },
    ],
    resultReviewReasonCodes: ["paths_exhausted"],
    ...overrides,
  }
}

function execute(
  current: ChannelSmokeScenario,
  value: CanonicalTelegramSmokeObservation = observation(),
) {
  return createTelegramLiveSmokeExecutor({
    startRequest: () => STARTED,
    observeTerminal: async () => value,
  })(current)
}

describe("Task 033 Telegram live acceptance matrix", () => {
  it("keeps a slow first response as latency evidence after verified completion", async () => {
    await expect(execute(scenario("basic_query"), observation({
      latencyEvidence: {
        ...observation().latencyEvidence!,
        durationMs: 45_000,
        status: "slow",
        terminalResponseLatencyMs: 50_000,
      },
    }))).resolves.toMatchObject({
      latency: {
        firstResponseStatus: "slow",
        firstResponseLatencyMs: 45_000,
        terminalResponseLatencyMs: 50_000,
      },
    })
  })

  it("supports all four configured Telegram smoke scenario kinds", async () => {
    await expect(execute(scenario("basic_query"))).resolves.toMatchObject({
      sourceChannel: "telegram",
      responseChannel: "telegram",
    })
    await expect(
      execute(
        scenario("approval_required_tool", {
          expectedTool: "screen_capture",
          expectsApproval: true,
          expectsArtifact: true,
        }),
      ),
    ).resolves.toMatchObject({
      toolCalls: [{ toolName: "screen_capture", sourceChannel: "telegram" }],
      approval: {
        requested: true,
        targetChannel: "telegram",
        uiVisible: true,
        uiKind: "button",
      },
      artifacts: [{ channel: "telegram", mode: "native_file" }],
    })
    await expect(
      execute(
        scenario("artifact_delivery", {
          expectedTool: "screen_capture",
          expectsArtifact: true,
        }),
      ),
    ).resolves.toMatchObject({
      toolCalls: [{ toolName: "screen_capture", deliveryChannel: "telegram" }],
      artifacts: [{ channel: "telegram", mode: "native_file" }],
    })
    await expect(
      execute(
        scenario("failure_tool", {
          expectsFailure: true,
          expectsUnsupportedCapability: true,
        }),
      ),
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
      "approval remains requested",
      scenario("approval_required_tool", { expectedTool: "screen_capture", expectsApproval: true }),
      observation({
        approvalReceipts: [
          {
            runId: STARTED.runId,
            requestGroupId: STARTED.requestGroupId,
            channel: "telegram",
            toolName: "screen_capture",
            status: "requested",
            uiVisible: true,
          },
        ],
      }),
      "telegram_live_smoke_approval_unresolved",
    ],
    [
      "tool belongs to another request group",
      scenario("artifact_delivery", { expectedTool: "screen_capture", expectsArtifact: true }),
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
      "telegram_live_smoke_tool_receipt_missing",
    ],
    [
      "failure was not reviewed as exhausted",
      scenario("failure_tool", {
        expectsFailure: true,
        expectsUnsupportedCapability: true,
      }),
      observation({ resultReviewReasonCodes: ["all_criteria_verified"] }),
      "telegram_live_smoke_paths_not_exhausted",
    ],
  ] as const)("fails closed when %s", async (_name, current, value, reasonCode) => {
    await expect(execute(current, value)).rejects.toThrow(reasonCode)
  })

  it("rejects a non-Telegram scenario before ingress", async () => {
    const startRequest = vi.fn(() => STARTED)
    const executor = createTelegramLiveSmokeExecutor({
      startRequest,
      observeTerminal: async () => observation(),
    })
    await expect(
      executor({ ...scenario("basic_query"), channel: "webui" }),
    ).rejects.toThrow("telegram_live_smoke_scenario_unsupported")
    expect(startRequest).not.toHaveBeenCalled()
  })

  it("projects Telegram tool, approval, artifact, and capability evidence without raw paths", () => {
    const audit = (overrides: Partial<DbAuditLog>): DbAuditLog => ({
      id: "audit-033",
      timestamp: 1,
      session_id: "session-033",
      run_id: STARTED.runId,
      request_group_id: STARTED.requestGroupId,
      channel: "telegram",
      source: "tool",
      tool_name: "screen_capture",
      params: null,
      output: null,
      result: "success",
      duration_ms: 1,
      approval_required: 1,
      approved_by: "telegram",
      error_code: null,
      retry_count: 0,
      stop_reason: null,
      ...overrides,
    })
    const approval: ApprovalRegistryRow = {
      id: "approval-033",
      run_id: STARTED.runId,
      request_group_id: STARTED.requestGroupId,
      channel: "telegram",
      channel_message_id: "provider-message-033",
      tool_name: "screen_capture",
      risk_level: "high",
      kind: "tool_execution",
      status: "consumed",
      params_hash: "hash",
      params_preview_json: null,
      requested_at: 1,
      expires_at: null,
      consumed_at: 2,
      decision_at: 2,
      decision_by: "telegram",
      decision_source: "button",
      superseded_by: null,
      metadata_json: null,
      created_at: 1,
      updated_at: 2,
    }
    const artifact: DbArtifactReceipt = {
      id: "artifact-033",
      run_id: STARTED.runId,
      request_group_id: STARTED.requestGroupId,
      channel: "telegram",
      artifact_path: "/Users/private/capture.png",
      mime_type: "image/png",
      size_bytes: 100,
      delivery_receipt_json: JSON.stringify({ provider: "telegram", status: "sent" }),
      delivered_at: 3,
      created_at: 2,
    }
    const read = createTelegramLiveSmokeEvidenceReader({
      listMessageLedgerEvents: () => [],
      listChannelMessageRefsForRun: () => [],
      listAuditLogsForRun: () => [
        audit({}),
        audit({
          id: "audit-failure-033",
          tool_name: "missing_tool",
          result: "failed",
          error_code: "tool_not_registered",
        }),
      ],
      getLatestApprovalForRun: () => approval,
      listArtifactReceiptsForRun: () => [artifact],
    })

    const projected = read(
      { id: STARTED.runId, requestGroupId: STARTED.requestGroupId },
      { chatId: -100033, userId: 33 },
    )
    expect(projected).toMatchObject({
      toolReceipts: expect.arrayContaining([
        {
          runId: STARTED.runId,
          requestGroupId: STARTED.requestGroupId,
          toolName: "screen_capture",
          result: "success",
        },
      ]),
      approvalReceipts: [
        {
          channel: "telegram",
          toolName: "screen_capture",
          status: "consumed",
          uiVisible: true,
        },
      ],
      artifactReceipts: [{ channel: "telegram", mode: "native_file" }],
      capabilityReceipts: [
        {
          capability: "tool_execution",
          receiptStatus: "unsupported_capability",
        },
      ],
    })
    expect(JSON.stringify(projected)).not.toMatch(/\/Users\/|capture\.png|-100033|provider-message/u)
  })
})
