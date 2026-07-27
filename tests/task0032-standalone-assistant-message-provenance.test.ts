import { describe, expect, it, vi } from "vitest"
import { emitStandaloneAssistantMessage } from "../packages/core/src/runs/finalization.ts"

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

describe("task0032 standalone assistant message provenance", () => {
  it("records explicit standalone text source", async () => {
    const dependencies = createDependencies()

    await emitStandaloneAssistantMessage({
      runId: "run-standalone-explicit",
      sessionId: "session-standalone-explicit",
      text: "확인이 필요합니다.",
      textSource: "llm_generated",
      source: "telegram",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-standalone-explicit",
      "user_facing_standalone_text_source:llm_generated",
    )
  })

  it("records deterministic source when standalone text source is missing", async () => {
    const dependencies = createDependencies()

    await emitStandaloneAssistantMessage({
      runId: "run-standalone-default",
      sessionId: "session-standalone-default",
      text: "설정에서 다시 확인해 주세요.",
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-standalone-default",
      "user_facing_standalone_text_source:runtime_deterministic",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-standalone-default",
      "user_facing_standalone_delivery_blocked:missing_context",
    )
    expect(dependencies.deliveryDependencies.writeReplyLog).not.toHaveBeenCalled()
  })
})
