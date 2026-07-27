import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { emitStandaloneAssistantMessage } from "../packages/core/src/runs/finalization.ts"
import { createTestDbRuntimeFixture, type TestDbRuntimeFixture } from "./fixtures/runtime-db.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"

let dbRuntime: TestDbRuntimeFixture
beforeEach(() => { dbRuntime = createTestDbRuntimeFixture("knowbee-standalone-rewrite-") })
afterEach(() => { dbRuntime.dispose() })

function createDependencies() {
  return {
    appendRunEvent: vi.fn(),
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

describe("task0033 standalone assistant message rewrite context", () => {
  it("rewrites eligible standalone message text through final response renderer", async () => {
    const dependencies = createDependencies()
    const renderFinalResponseText = vi.fn(async (input) =>
      buildReviewedFinalResponse(input, "AI 연결 설정을 확인한 뒤 다시 요청해 주세요."))

    await emitStandaloneAssistantMessage({
      runId: "run-standalone-rewrite",
      sessionId: "session-standalone-rewrite",
      text: "설정에서 다시 확인해 주세요.",
      textSource: "runtime_deterministic",
      responseContext: {
        originalRequest: "왜 안돼?",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(renderFinalResponseText).toHaveBeenCalledWith({
      originalRequest: "왜 안돼?",
      rawText: "설정에서 다시 확인해 주세요.",
      textSource: "runtime_deterministic",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
    })
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-standalone-rewrite",
      "user_facing_standalone_rewritten:llm",
    )
    expect(dependencies.deliveryDependencies.writeReplyLog).toHaveBeenCalledWith(
      "webui",
      "AI 연결 설정을 확인한 뒤 다시 요청해 주세요.",
    )
  })

  it("blocks standalone deterministic message delivery when response context is missing", async () => {
    const dependencies = createDependencies()
    const renderFinalResponseText = vi.fn()

    await emitStandaloneAssistantMessage({
      runId: "run-standalone-missing-context",
      sessionId: "session-standalone-missing-context",
      text: "사용 가능한 AI 연결이 없습니다.",
      textSource: "runtime_deterministic",
      renderFinalResponseText,
      source: "telegram",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(renderFinalResponseText).not.toHaveBeenCalled()
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-standalone-missing-context",
      "user_facing_standalone_rewrite_blocked:missing_context",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-standalone-missing-context",
      "user_facing_standalone_delivery_blocked:missing_context",
    )
    expect(dependencies.deliveryDependencies.writeReplyLog).not.toHaveBeenCalled()
  })

  it("rewrites LLM-generated standalone message text through final response renderer", async () => {
    const dependencies = createDependencies()
    const renderFinalResponseText = vi.fn(async (input) =>
      buildReviewedFinalResponse(input, "최종 검토된 안내입니다."))

    await emitStandaloneAssistantMessage({
      runId: "run-standalone-llm",
      sessionId: "session-standalone-llm",
      text: "이미 정리된 안내입니다.",
      textSource: "llm_generated",
      responseContext: {
        originalRequest: "상태 알려줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(renderFinalResponseText).toHaveBeenCalledWith({
      originalRequest: "상태 알려줘",
      rawText: "이미 정리된 안내입니다.",
      textSource: "llm_generated",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
    })
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-standalone-llm",
      "user_facing_standalone_rewritten:llm",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-standalone-llm",
      "user_facing_standalone_provenance:llm_reviewed:final_response:llm_generated",
    )
    expect(dependencies.deliveryDependencies.writeReplyLog).toHaveBeenCalledWith(
      "webui",
      "최종 검토된 안내입니다.",
    )
  })
})
