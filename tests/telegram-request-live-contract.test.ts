import { describe, expect, it, vi } from "vitest"
import { createApiServerRuntimeContext } from "../packages/core/src/api/server-runtime-context.ts"
import type { ChannelSmokeScenario } from "../packages/core/src/channels/smoke-runner.ts"
import {
  type CanonicalTelegramSmokeObservation,
  type StartedCanonicalTelegramSmokeRequest,
  createTelegramLiveSmokeExecutor,
} from "../packages/core/src/channels/telegram-live-smoke-executor.ts"
import { buildRuntimeBuildStatus } from "../packages/core/src/runtime/build-status.ts"
import { createStartupProcessContext } from "../packages/core/src/runtime/startup-process-context.ts"

const BUILD_IDENTITY = "a".repeat(40)
const STARTED: StartedCanonicalTelegramSmokeRequest = {
  requestId: "request:live-contract",
  runId: "run:live-contract",
  requestGroupId: "run:live-contract",
  targetFingerprint: "telegram-target:live-contract",
}
const SCENARIO: ChannelSmokeScenario = {
  id: "telegram.basic_query.live_contract",
  channel: "telegram",
  kind: "basic_query",
  title: "Telegram direct answer",
  request: "Give a concise direct answer.",
  expectedTarget: "telegram",
  correlationKey: "telegram_chat_thread",
  requiresExternalCredential: true,
  releaseGate: "automated",
}

function completeObservation(
  overrides: Partial<CanonicalTelegramSmokeObservation> = {},
): CanonicalTelegramSmokeObservation {
  return {
    ...STARTED,
    terminalStatus: "completed",
    typedTraceStatus: "ready",
    typedTraceTerminal: true,
    typedTraceIssueCount: 0,
    analysisCompleted: true,
    requestDiagnosisReceiptId: "receipt:diagnosis:live-contract",
    solutionPlanReceiptId: "receipt:plan:live-contract",
    evidenceRecorded: true,
    reviewCompleted: true,
    resultReviewReceiptId: "receipt:review:live-contract",
    finalResponseReceiptId: "receipt:final-response:live-contract",
    decisionReceiptOrderValid: true,
    finalizationCompleted: true,
    rootOwnerFinalized: true,
    finalAnswerCount: 1,
    topologyRunCount: 1,
    auditEventId: "audit:live-contract",
    providerDeliveryReceipted: true,
    targetMatched: true,
    userReportDelivered: true,
    deliveryReceiptRef: "receipt:delivery:live-contract",
    resultReviewReasonCodes: ["goal_satisfied"],
    executionOutcome: {
      executionStatus: "succeeded",
      deliveryStatus: "delivered",
    },
    latencyEvidence: {
      metricId: "latency-live-contract",
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

describe("Telegram request live contract", () => {
  it("binds build readiness and Telegram target selection to the startup snapshot", () => {
    const env: Record<string, string | undefined> = {
      KNOWBEE_CHANNEL_SMOKE_LIVE: "1",
      KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID: "-100700",
      KNOWBEE_CHANNEL_SMOKE_TELEGRAM_USER_ID: "700",
      KNOWBEE_CHANNEL_SMOKE_TELEGRAM_THREAD_ID: "7",
    }
    const startup = createStartupProcessContext({
      env,
      argv: ["node", "knowbee", "serve"],
      cwd: "/workspace",
    })
    env.KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID = "-100999"

    const runtime = createApiServerRuntimeContext(startup)
    const status = buildRuntimeBuildStatus({
      workspaceRoot: "/workspace",
      processStartTimeMs: 1,
      now: new Date(2),
      packages: [],
      commandRunner: (_command, args) =>
        args[0] === "rev-parse" ? BUILD_IDENTITY : "live-contract-build",
    })

    expect(runtime).toMatchObject({
      channelSmokeLiveEnabled: true,
      telegramLiveSmokeTarget: {
        chatId: -100700,
        userId: 700,
        threadId: 7,
      },
    })
    expect(status).toMatchObject({
      gitCommit: BUILD_IDENTITY,
      buildId: "live-contract-build",
      buildRequired: false,
      restartRequired: false,
    })
  })

  it("accepts completion only with three LLM receipts and exactly-once target delivery evidence", async () => {
    const startRequest = vi.fn(() => STARTED)
    const observeTerminal = vi.fn(async () => completeObservation())
    const execute = createTelegramLiveSmokeExecutor({ startRequest, observeTerminal })

    await expect(execute(SCENARIO)).resolves.toMatchObject({
      requestFlow: {
        requestDiagnosisReceiptId: "receipt:diagnosis:live-contract",
        solutionPlanReceiptId: "receipt:plan:live-contract",
        resultReviewReceiptId: "receipt:review:live-contract",
      },
      finalization: {
        rootOwnerFinalized: true,
        finalAnswerCount: 1,
      },
      finalDelivery: {
        delivered: true,
        targetChannel: "telegram",
        receiptRef: "receipt:delivery:live-contract",
      },
      semanticOutcome: {
        executionStatus: "succeeded",
        deliveryStatus: "delivered",
      },
    })
    expect(startRequest).toHaveBeenCalledTimes(1)
    expect(observeTerminal).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ solutionPlanReceiptId: undefined }, "telegram_live_smoke_solution_plan_receipt_missing"],
    [{ finalAnswerCount: 2 }, "telegram_live_smoke_root_finalization_invalid"],
    [{ targetMatched: false }, "telegram_live_smoke_target_mismatch"],
    [{ providerDeliveryReceipted: false }, "telegram_live_smoke_provider_receipt_missing"],
  ] as const)("fails closed when terminal evidence is incomplete", async (overrides, reasonCode) => {
    const execute = createTelegramLiveSmokeExecutor({
      startRequest: () => STARTED,
      observeTerminal: async () =>
        completeObservation(overrides as Partial<CanonicalTelegramSmokeObservation>),
    })

    await expect(execute(SCENARIO)).rejects.toThrow(reasonCode)
  })
})
