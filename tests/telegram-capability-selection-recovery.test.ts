import { describe, expect, it, vi } from "vitest"
import {
  collectStructuredJsonAttempt,
} from "../packages/core/src/ai/structured-json-attempt.ts"
import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import type {
  LlmCapabilitySelectionDecision,
} from "../packages/core/src/contracts/llm-capability-selection.ts"
import type { ChannelSmokeScenario } from "../packages/core/src/channels/smoke-runner.ts"
import {
  type CanonicalTelegramSmokeObservation,
  createTelegramLiveSmokeExecutor,
} from "../packages/core/src/channels/telegram-live-smoke-executor.ts"
import { executeCapabilitySelection } from "../packages/core/src/runs/capability-selection-use-case.ts"

const fingerprint = `sha256:${"a".repeat(64)}` as const
const snapshot = {
  snapshotId: "selection:telegram-recovery",
  fingerprint,
  bindings: [
    { capabilityId: "skill:web", targetId: "agent:main", risk: "safe" as const },
  ],
}
const selectionContext = {
  goal: "Find current public information.",
  constraints: ["Use a read-only public source."],
  completionCriteria: ["Return verified current information."],
  failedStrategyFingerprints: [] as string[],
}

function decision(permission: "allowed" | "denied" = "allowed"): LlmCapabilitySelectionDecision {
  return {
    schemaVersion: 1,
    runId: "run-telegram-recovery",
    capabilitySnapshotId: snapshot.snapshotId,
    capabilitySnapshotFingerprint: fingerprint,
    comparedBindings: [{ capabilityId: "skill:web", targetId: "agent:main" }],
    bindingAssessments: [{
      capabilityId: "skill:web",
      targetId: "agent:main",
      roleFit: "fit",
      permission,
      sideEffect: "read",
      evidenceQuality: "direct",
      dataExposure: "public",
      externalTransfer: true,
      cost: "low",
      strategyFingerprint: "strategy:web:current:v2",
      changedFromFailedStrategies: true,
      reason: "Current public information requires the read-only web capability.",
    }],
    selectedBinding: {
      capabilityId: "skill:web",
      targetId: "agent:main",
    },
    reason: "The read-only web capability best satisfies the request.",
  }
}

const scenario: ChannelSmokeScenario = {
  id: "telegram.web_skill.capability_recovery",
  channel: "telegram",
  kind: "web_skill",
  title: "Telegram current information",
  request: "현재 공개 정보를 확인해줘",
  expectedTarget: "telegram",
  expectedTool: "web_search",
  correlationKey: "telegram_chat_thread",
  requiresExternalCredential: true,
  releaseGate: "automated",
}

function observation(
  overrides: Partial<CanonicalTelegramSmokeObservation> = {},
): CanonicalTelegramSmokeObservation {
  return {
    requestId: "run-telegram-recovery",
    runId: "run-telegram-recovery",
    requestGroupId: "run-telegram-recovery",
    targetFingerprint: "telegram-target:recovery",
    terminalStatus: "completed",
    typedTraceStatus: "ready",
    typedTraceTerminal: true,
    typedTraceIssueCount: 0,
    analysisCompleted: true,
    requestDiagnosisReceiptId: "receipt:diagnosis:telegram-recovery",
    solutionPlanReceiptId: "receipt:plan:telegram-recovery",
    capabilityAdmissionReceiptId:
      "receipt:capability-admission:telegram-recovery",
    evidenceRecorded: true,
    reviewCompleted: true,
    resultReviewReceiptId: "receipt:review:telegram-recovery",
    finalResponseReceiptId: "receipt:final-response:telegram-recovery",
    decisionReceiptOrderValid: true,
    finalizationCompleted: true,
    rootOwnerFinalized: true,
    finalAnswerCount: 1,
    topologyRunCount: 1,
    auditEventId: "audit:telegram-recovery",
    providerDeliveryReceipted: true,
    targetMatched: true,
    userReportDelivered: true,
    deliveryReceiptRef: "receipt:delivery:telegram-recovery",
    toolReceipts: [{
      runId: "run-telegram-recovery",
      requestGroupId: "run-telegram-recovery",
      toolName: "web_search",
      result: "success",
    }],
    resultReviewReasonCodes: ["goal_satisfied"],
    executionOutcome: {
      executionStatus: "succeeded",
      deliveryStatus: "delivered",
    },
    ...overrides,
  }
}

describe("Telegram capability selection recovery integration", () => {
  it("accepts an 8,917-token usage fixture when visible JSON remains under 64 KiB", async () => {
    const provider: AIProvider = {
      id: "fixture",
      supportedModels: ["fixture-model"],
      maxContextTokens: () => 16_000,
      chat: async function* (_params: ChatParams): AsyncGenerator<AIChunk> {
        yield { type: "text_delta", delta: '{"status":"ok"}' }
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 8_917 },
        }
      },
    }

    await expect(collectStructuredJsonAttempt({
      provider,
      chatParams: {
        model: "fixture-model",
        messages: [{ role: "user", content: "return JSON" }],
        maxTokens: 12_288,
      },
      deadlineMs: 180_000,
      maxVisibleTextBytes: 65_536,
    })).resolves.toEqual({
      status: "parsed",
      value: { status: "ok" },
    })
  })

  it("repairs malformed selection once and preserves valid rejection evidence", async () => {
    let repairCalls = 0
    const repaired = await executeCapabilitySelection({
      runId: "run-telegram-recovery",
      receiptId: "receipt:capability-selection:telegram-recovery",
      capabilitySnapshot: snapshot,
      selectionContext,
      provider: {
        attemptCapabilitySelection: () => ({
          status: "invalid_output",
          reasonCode: "invalid_json",
        }),
      },
      repairProvider: {
        repairCapabilitySelection: () => {
          repairCalls += 1
          return { status: "completed", output: decision() }
        },
      },
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })
    const rejected = await executeCapabilitySelection({
      runId: "run-telegram-recovery",
      receiptId: "receipt:capability-selection:telegram-recovery",
      capabilitySnapshot: snapshot,
      selectionContext,
      provider: {
        attemptCapabilitySelection: () => ({
          status: "completed",
          output: decision("denied"),
        }),
      },
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(repairCalls).toBe(1)
    expect(repaired).toMatchObject({ status: "allowed" })
    expect(rejected).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["selected_binding_permission_denied"]),
      strategyFingerprints: ["strategy:web:current:v2"],
    })
  })

  it("accepts read-only web completion only with plan admission and exact delivery evidence", async () => {
    const execute = createTelegramLiveSmokeExecutor({
      startRequest: vi.fn(() => ({
        requestId: "run-telegram-recovery",
        runId: "run-telegram-recovery",
        requestGroupId: "run-telegram-recovery",
        targetFingerprint: "telegram-target:recovery",
      })),
      observeTerminal: vi.fn(async () => observation()),
    })

    await expect(execute(scenario)).resolves.toMatchObject({
      requestFlow: {
        runId: "run-telegram-recovery",
        capabilityAdmissionRequired: true,
        capabilityAdmissionReceiptId:
          "receipt:capability-admission:telegram-recovery",
      },
      finalDelivery: {
        delivered: true,
        targetChannel: "telegram",
        receiptRef: "receipt:delivery:telegram-recovery",
      },
    })
  })

  it.each([
    [
      { capabilityAdmissionReceiptId: undefined },
      "telegram_live_smoke_capability_admission_receipt_missing",
    ],
    [
      { providerDeliveryReceipted: false },
      "telegram_live_smoke_provider_receipt_missing",
    ],
  ] as const)("fails closed when the integration post-check is incomplete", async (
    overrides,
    reasonCode,
  ) => {
    const execute = createTelegramLiveSmokeExecutor({
      startRequest: () => ({
        requestId: "run-telegram-recovery",
        runId: "run-telegram-recovery",
        requestGroupId: "run-telegram-recovery",
        targetFingerprint: "telegram-target:recovery",
      }),
      observeTerminal: async () => observation(
        overrides as Partial<CanonicalTelegramSmokeObservation>,
      ),
    })

    await expect(execute(scenario)).rejects.toThrow(reasonCode)
  })
})
