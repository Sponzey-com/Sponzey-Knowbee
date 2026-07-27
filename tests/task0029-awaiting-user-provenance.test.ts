import { describe, expect, it, vi } from "vitest"
import { applyLoopDirective } from "../packages/core/src/runs/loop-directive-application.ts"

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    onDeliveryError: vi.fn(),
  }
}

function createModuleDependencies() {
  return {
    completeRunWithAssistantMessage: vi.fn(),
    markRunCompleted: vi.fn(),
    applyTerminalApplication: vi.fn().mockResolvedValue("awaiting_user"),
    renderFinalResponseText: vi.fn(),
  }
}

describe("task0029 awaiting user provenance", () => {
  it("records explicit awaiting user message source", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const moduleDependencies = createModuleDependencies()

    await applyLoopDirective({
      runId: "run-awaiting-llm",
      sessionId: "session-awaiting-llm",
      source: "telegram",
      onChunk: undefined,
      directive: {
        kind: "awaiting_user",
        preview: "",
        summary: "확인이 필요합니다.",
        userMessage: "어느 파일을 수정할까요?",
        userMessageSource: "llm_generated",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-awaiting-llm",
      "user_facing_awaiting_user_message_source:llm_generated",
    )
  })

  it("records deterministic source for awaiting user directives without explicit source", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const moduleDependencies = createModuleDependencies()

    await applyLoopDirective({
      runId: "run-awaiting-default",
      sessionId: "session-awaiting-default",
      source: "webui",
      onChunk: undefined,
      directive: {
        kind: "awaiting_user",
        preview: "",
        summary: "추가 입력 필요",
        userMessage: "대상을 지정해 주세요.",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-awaiting-default",
      "user_facing_awaiting_user_message_source:runtime_deterministic",
    )
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        userMessageSource: "runtime_deterministic",
      }),
    }))
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.not.objectContaining({
        userMessage: "대상을 지정해 주세요.",
      }),
    }))
  })
})
