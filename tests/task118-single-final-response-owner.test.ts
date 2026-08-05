import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { completeRunWithAssistantMessage } from "../packages/core/src/runs/finalization.ts"
import { applyLoopDirective } from "../packages/core/src/runs/loop-directive-application.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let dbRuntime: TestDbRuntimeFixture
beforeEach(() => {
  dbRuntime = createTestDbRuntimeFixture("knowbee-task118-")
})
afterEach(() => {
  dbRuntime.dispose()
})

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    onDeliveryError: vi.fn(),
    deliveryDependencies: {
      now: () => 0,
      createId: () => "message-task118",
      insertMessage: vi.fn(),
      emitStart: vi.fn(),
      emitStream: vi.fn(),
      emitEnd: vi.fn(),
      writeReplyLog: vi.fn(),
    },
  }
}

const responseContext = {
  originalRequest: "인사해줘",
  model: "gpt-test",
  providerId: "openai",
  config: DEFAULT_CONFIG,
  workDir: "/tmp/project",
}

describe("Task 118 single final-response owner", () => {
  it("forwards the raw complete directive and response context without rendering in the loop adapter", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn()
    const complete = vi.fn().mockResolvedValue({ status: "completed" })

    await applyLoopDirective(
      {
        runId: "run-task118-forward",
        sessionId: "session-task118-forward",
        source: "webui",
        onChunk: undefined,
        directive: {
          kind: "complete",
          text: "안녕하세요.",
          textSource: "llm_generated",
        },
        responseContext,
        finalizationDependencies,
      },
      {
        completeRunWithAssistantMessage: complete,
        markRunCompleted: vi.fn(),
        applyTerminalApplication: vi.fn(),
        renderFinalResponseText,
      },
    )

    expect(renderFinalResponseText).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "안녕하세요.",
        textSource: "llm_generated",
        responseContext,
        renderFinalResponseText,
      }),
    )
  })

  it("renders, authorizes, and delivers a complete directive exactly once", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn(async (input) =>
      buildReviewedFinalResponse(input, "안녕하세요. 무엇을 도와드릴까요?"),
    )

    await applyLoopDirective(
      {
        runId: "run-task118-delivery",
        sessionId: "session-task118-delivery",
        source: "webui",
        onChunk: vi.fn().mockResolvedValue(undefined),
        directive: {
          kind: "complete",
          text: "안녕하세요.",
          textSource: "llm_generated",
        },
        responseContext,
        finalizationDependencies,
      },
      {
        completeRunWithAssistantMessage,
        markRunCompleted: vi.fn(),
        applyTerminalApplication: vi.fn(),
        renderFinalResponseText,
      },
    )

    expect(renderFinalResponseText).toHaveBeenCalledTimes(1)
    expect(finalizationDependencies.deliveryDependencies.writeReplyLog).toHaveBeenCalledWith(
      "webui",
      "안녕하세요. 무엇을 도와드릴까요?",
    )
    expect(finalizationDependencies.rememberRunSuccess).toHaveBeenCalledTimes(1)
    expect(finalizationDependencies.rememberRunFailure).not.toHaveBeenCalled()
    expect(finalizationDependencies.appendRunEvent).not.toHaveBeenCalledWith(
      "run-task118-delivery",
      "user_facing_completion_blocked:missing_context",
    )
  })
})
