import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildAwaitingUserMessage,
  completeRunWithAssistantMessage,
  markRunCompleted,
  moveRunToAwaitingUser,
  moveRunToCancelledAfterStop,
  recordFirstResponseFromFinalDelivery,
} from "../packages/core/src/runs/finalization.ts"
import {
  createTestDbRuntimeFixture,
  type TestDbRuntimeFixture,
} from "./fixtures/runtime-db.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"
import {
  buildDirectLlmResponseReviewReceipt,
  buildLlmResponseReviewReceipt,
} from "../packages/core/src/runs/user-facing-response-gate.ts"

let dbRuntime: TestDbRuntimeFixture

beforeEach(() => {
  dbRuntime = createTestDbRuntimeFixture("knowbee-run-finalization-")
})

afterEach(() => {
  dbRuntime.dispose()
})

function createDeps() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    rememberRunAwaitingUser: vi.fn(),
    onDeliveryError: vi.fn(),
    deliveryDependencies: {
      now: () => 0,
      createId: () => "message-1",
      insertMessage: vi.fn(),
      emitStart: vi.fn(),
      emitStream: vi.fn(),
      emitEnd: vi.fn(),
      writeReplyLog: vi.fn(),
    },
  }
}

describe("run finalization helpers", () => {
  it("builds an awaiting-user message with sanitized raw error details", () => {
    const message = buildAwaitingUserMessage({
      preview: "중간 결과",
      summary: "추가 정보가 필요합니다.",
      reason: "대상 파일 경로가 없습니다.",
      rawMessage: "claude exited with code 1\n    at runWorker (/tmp/worker.js:10:2)",
      userMessage: "어느 파일을 수정해야 하나요?",
      remainingItems: ["대상 파일 확인"],
    })

    expect(message).toContain("어느 파일을 수정해야 하나요?")
    expect(message).toContain("현재까지 결과:")
    expect(message).toContain("남은 항목:")
    expect(message).toContain("중단 사유:")
    expect(message).toContain("오류 세부:")
    expect(message).toContain("도구 또는 실행 경로에서 오류가 발생했습니다.")
    expect(message).toContain("권장 조치:")
    expect(message).toContain("도구 권한")
    expect(message).not.toContain("claude exited with code 1")
    expect(message).not.toContain("/tmp/worker.js")
  })

  it("moves a run to awaiting_user and blocks standalone delivery without final response context", async () => {
    const deps = createDeps()
    const onChunk = vi.fn().mockResolvedValue(undefined)
    const runId = `run-finalization-awaiting-user-${Date.now()}`
    const sessionId = `session-finalization-awaiting-user-${Date.now()}`

    await moveRunToAwaitingUser({
      runId,
      sessionId,
      source: "telegram",
      onChunk,
      awaitingUser: {
        preview: "현재까지 결과",
        summary: "추가 입력 필요",
        userMessage: "계속하려면 파일명을 알려 주세요.",
      },
      dependencies: deps,
    })

    expect(onChunk).not.toHaveBeenCalled()
    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      runId,
      "user_facing_standalone_delivery_blocked:missing_context",
    )
    expect(deps.setRunStepStatus).toHaveBeenCalledWith(runId, "awaiting_user", "running", "추가 입력 필요")
    expect(deps.updateRunStatus).toHaveBeenCalledWith(runId, "awaiting_user", "추가 입력 필요", true)
    expect(deps.rememberRunAwaitingUser).toHaveBeenCalledWith({
      runId,
      sessionId,
      source: "telegram",
      summary: "추가 입력 필요",
      userMessage: "계속하려면 파일명을 알려 주세요.",
    })
    expect(deps.appendRunEvent).toHaveBeenCalledWith(runId, "사용자 추가 입력 대기")
  })

  it("moves a run to cancelled after stop and records failure", async () => {
    const deps = createDeps()
    const onChunk = vi.fn().mockResolvedValue(undefined)
    const runId = `run-finalization-cancelled-${Date.now()}`
    const sessionId = `session-finalization-cancelled-${Date.now()}`

    await moveRunToCancelledAfterStop({
      runId,
      sessionId,
      source: "telegram",
      onChunk,
      cancellation: {
        preview: "현재까지 결과",
        summary: "자동 진행 중단",
        reason: "권한 승인이 없습니다.",
        remainingItems: ["승인 필요"],
      },
      dependencies: deps,
    })

    expect(deps.rememberRunFailure).toHaveBeenCalled()
    expect(deps.updateRunStatus).toHaveBeenCalledWith(runId, "cancelled", "자동 진행 중단", false)
    expect(deps.appendRunEvent).toHaveBeenCalledWith(runId, "자동 진행 중단 후 요청 취소")
  })

  it("blocks cancelled stop standalone delivery without final response context", async () => {
    const deps = createDeps()
    const onChunk = vi.fn().mockResolvedValue(undefined)
    const runId = `run-finalization-stop-missing-context-${Date.now()}`
    const sessionId = `session-finalization-stop-missing-context-${Date.now()}`

    await moveRunToCancelledAfterStop({
      runId,
      sessionId,
      source: "telegram",
      onChunk,
      cancellation: {
        preview: "",
        summary: "자동 진행 중단",
        userMessage: "현재 정보로는 요청을 처리할 수 없습니다.",
      },
      dependencies: deps,
    })

    expect(onChunk).not.toHaveBeenCalled()
    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      runId,
      "user_facing_standalone_delivery_blocked:missing_context",
    )
    expect(deps.rememberRunFailure).toHaveBeenCalledWith(expect.objectContaining({
      runId,
      sessionId,
      source: "telegram",
      summary: "자동 진행 중단",
      title: "cancelled_after_stop",
    }))
    expect(deps.updateRunStatus).toHaveBeenCalledWith(runId, "cancelled", "자동 진행 중단", false)
  })

  it("completes a run and records success", async () => {
    const deps = createDeps()
    const onChunk = vi.fn(async (chunk: { type: string }) =>
      chunk.type === "done"
        ? {
            textDeliveries: [
              {
                channel: "telegram" as const,
                text: "완료했습니다.",
                messageIds: [1],
                deliveryReceipts: [
                  {
                    channelId: "telegram:primary",
                    provider: "telegram",
                    connectionId: "telegram:primary",
                    target: { roomId: "chat:finalization" },
                    status: "sent" as const,
                    timestamp: 1,
                    idempotencyKey: "telegram:finalization:success",
                    messageId: "1",
                  },
                ],
              },
            ],
          }
        : undefined,
    )
    const runId = `run-finalization-complete-${Date.now()}`
    const sessionId = `session-finalization-complete-${Date.now()}`

    const outcome = await completeRunWithAssistantMessage({
      runId,
      sessionId,
      text: "완료했습니다.",
      textSource: "llm_reviewed",
      responseContext: {
        originalRequest: "요청을 완료해줘",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      },
      renderFinalResponseText: vi.fn(async (input) =>
        buildReviewedFinalResponse(input, "완료했습니다.")),
      source: "telegram",
      onChunk,
      dependencies: deps,
    })

    expect(outcome.status).toBe("completed")
    expect(deps.rememberRunSuccess).toHaveBeenCalledWith({
      runId,
      sessionId,
      source: "telegram",
      text: "완료했습니다.",
      summary: "완료했습니다.",
    })
    expect(deps.updateRunStatus).toHaveBeenCalledWith(runId, "completed", "완료했습니다.", false)
    expect(deps.appendRunEvent).toHaveBeenCalledWith(runId, "실행 완료")
  })

  it("records a delivered final receipt without accepting a provider completion alone", () => {
    const recordFirstResponseReceipt = vi.fn()
    recordFirstResponseFromFinalDelivery(
      {
        status: "delivered",
        deliveryReceipt: {
          persisted: true,
          textDelivered: true,
          doneDelivered: true,
          runId: "run-direct",
          receiptRef: "message-ledger:direct",
          deliveredAtMs: 30_000,
        },
      },
      recordFirstResponseReceipt,
    )
    recordFirstResponseFromFinalDelivery({ status: "delivered" }, recordFirstResponseReceipt)

    expect(recordFirstResponseReceipt).toHaveBeenCalledOnce()
    expect(recordFirstResponseReceipt).toHaveBeenCalledWith({
      runId: "run-direct",
      receiptRef: "message-ledger:direct",
      deliveredAtMs: 30_000,
    })
  })

  it("delivers a typed intake direct answer without a second renderer call", async () => {
    const deps = createDeps()
    const text = "바로 답할 수 있는 최종 답변입니다."
    const renderFinalResponseText = vi.fn()
    const outcome = await completeRunWithAssistantMessage({
      runId: `run-direct-single-${Date.now()}`,
      sessionId: `session-direct-single-${Date.now()}`,
      text,
      textSource: "llm_generated",
      preauthorizedResponseReview: {
        rawText: text,
        rawTextSource: "llm_generated",
        contentKind: "direct_answer",
        expectedLanguage: "ko",
        receipt: buildDirectLlmResponseReviewReceipt({
          rawText: text,
          responseText: text,
          taskIntakePromptSha256: "a".repeat(64),
          finalResponsePromptSha256: "b".repeat(64),
          providerInvocationRef: "provider-invocation:test",
        }),
      },
      source: "webui",
      onChunk: undefined,
      renderFinalResponseText,
      dependencies: deps,
    })

    expect(outcome.status).toBe("completed")
    expect(renderFinalResponseText).not.toHaveBeenCalled()
  })

  it("blocks a mismatched direct-answer receipt without an inline renderer retry", async () => {
    const deps = createDeps()
    const text = "변조된 답변"
    const renderFinalResponseText = vi.fn()
    const outcome = await completeRunWithAssistantMessage({
      runId: `run-direct-mismatch-${Date.now()}`,
      sessionId: `session-direct-mismatch-${Date.now()}`,
      text,
      textSource: "llm_generated",
      preauthorizedResponseReview: {
        rawText: "원래 답변",
        rawTextSource: "llm_generated",
        contentKind: "direct_answer",
        expectedLanguage: "ko",
        receipt: buildLlmResponseReviewReceipt({
          rawText: "원래 답변",
          responseText: "원래 답변",
          rawTextSource: "llm_generated",
          contentKind: "direct_answer",
        }),
      },
      source: "webui",
      onChunk: undefined,
      renderFinalResponseText,
      dependencies: deps,
    })

    expect(outcome.status).toBe("blocked_by_final_response_rendering")
    expect(renderFinalResponseText).not.toHaveBeenCalled()
  })

  it("marks a run completed without emitting assistant delivery", () => {
    const deps = createDeps()

    markRunCompleted({
      runId: "run-2",
      sessionId: "session-2",
      source: "telegram",
      text: "파일 전달 완료",
      summary: "텔레그램 파일 전달 완료",
      reviewingSummary: "텔레그램 파일 전달 완료",
      finalizingSummary: "전달 결과를 저장했습니다.",
      completedSummary: "파일 전달 완료",
      eventLabel: "텔레그램 파일 전달 완료",
      dependencies: deps,
    })

    expect(deps.rememberRunSuccess).toHaveBeenCalledWith({
      runId: "run-2",
      sessionId: "session-2",
      source: "telegram",
      text: "파일 전달 완료",
      summary: "텔레그램 파일 전달 완료",
    })
    expect(deps.updateRunStatus).toHaveBeenCalledWith("run-2", "completed", "파일 전달 완료", false)
    expect(deps.appendRunEvent).toHaveBeenCalledWith("run-2", "텔레그램 파일 전달 완료")
  })
})
