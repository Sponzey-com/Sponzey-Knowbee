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

function createModuleDependencies(
  overrides: {
    renderFinalResponseText?: ReturnType<typeof vi.fn>
  } = {},
) {
  return {
    completeRunWithAssistantMessage: vi.fn().mockResolvedValue(undefined),
    markRunCompleted: vi.fn(),
    applyTerminalApplication: vi.fn(),
    renderFinalResponseText: overrides.renderFinalResponseText ?? vi.fn(),
  }
}

describe("task0028 loop directive final response rewrite", () => {
  it("forwards runtime deterministic complete text to the finalization owner", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn().mockResolvedValue({
      text: "예약을 저장했습니다.",
    })
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective(
      {
        runId: "run-rewrite",
        sessionId: "session-rewrite",
        source: "telegram",
        onChunk: undefined,
        directive: {
          kind: "complete",
          text: "스케줄이 저장되었습니다.",
          textSource: "runtime_deterministic",
        },
        responseContext: {
          originalRequest: "내일 알려줘",
          model: "gpt-test",
          providerId: "openai",
          workDir: "/tmp/project",
        },
        finalizationDependencies,
      },
      moduleDependencies,
    )

    expect(renderFinalResponseText).not.toHaveBeenCalled()
    expect(moduleDependencies.completeRunWithAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "스케줄이 저장되었습니다.",
        textSource: "runtime_deterministic",
        responseContext: expect.objectContaining({ originalRequest: "내일 알려줘" }),
        renderFinalResponseText,
      }),
    )
  })

  it("forwards LLM-generated complete text without trusting it as final", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn().mockResolvedValue({
      text: "최종 검토된 답변입니다.",
    })
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective(
      {
        runId: "run-llm",
        sessionId: "session-llm",
        source: "webui",
        onChunk: undefined,
        directive: {
          kind: "complete",
          text: "이미 정리된 답변입니다.",
          textSource: "llm_generated",
        },
        responseContext: {
          originalRequest: "대답해줘",
          model: "gpt-test",
          providerId: "openai",
          workDir: "/tmp/project",
        },
        finalizationDependencies,
      },
      moduleDependencies,
    )

    expect(renderFinalResponseText).not.toHaveBeenCalled()
    expect(moduleDependencies.completeRunWithAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "이미 정리된 답변입니다.",
        textSource: "llm_generated",
        responseContext: expect.objectContaining({ originalRequest: "대답해줘" }),
        renderFinalResponseText,
      }),
    )
  })

  it("preserves deterministic provenance for finalization blocking when response context is missing", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn()
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective(
      {
        runId: "run-missing-context",
        sessionId: "session-missing-context",
        source: "webui",
        onChunk: undefined,
        directive: {
          kind: "complete",
          text: "스케줄이 저장되었습니다.",
          textSource: "runtime_deterministic",
        },
        finalizationDependencies,
      },
      moduleDependencies,
    )

    expect(renderFinalResponseText).not.toHaveBeenCalled()
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-missing-context",
      "user_facing_response_context:missing",
    )
    expect(moduleDependencies.completeRunWithAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "스케줄이 저장되었습니다.",
        textSource: "runtime_deterministic",
        renderFinalResponseText,
      }),
    )
    expect(
      moduleDependencies.completeRunWithAssistantMessage.mock.calls[0]?.[0],
    ).not.toHaveProperty("responseContext")
  })
})
